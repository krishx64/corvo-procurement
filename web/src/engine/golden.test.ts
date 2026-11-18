import { describe, it, expect, beforeAll } from 'vitest';
import { kitDir, loadKit } from './testkit';
import { runEngine } from './run';
import type { EngineResult } from './types';

const dir = kitDir();
const maybe = dir ? describe : describe.skip;

let res: EngineResult;

function row(pr: string) {
  return res.rows.find((r) => r.pr_no === pr)!;
}

/**
 * The published worked examples were produced on the batch without the two
 * appended edge-case rows PR-26-00174/00175 (see DECISIONS.md — the batch tail
 * PR-26-00170..186 is a set of traps added after the examples were generated;
 * under a literal 5.4 reading those two create one extra spot PO and shift
 * every later PO number by one).
 */
maybe('golden run against the published worked examples', () => {
  beforeAll(() => {
    const input = loadKit();
    input.prLines = input.prLines.filter((l) => !['PR-26-00174', 'PR-26-00175'].includes(l.pr_no));
    res = runEngine(input);
  });

  it('1. contract PO at contract rate (PR-26-00019)', () => {
    const r = row('PR-26-00019');
    expect(r.route).toBe('CONTRACT_PO');
    expect(r.supplier_id).toBe('S001');
    expect(r.unit_price).toBe('9168.71');
    expect(r.group_value_inr).toBe('137530.65');
    expect(r.po_id).toBe('PO-0011');
    expect(r.policy_version).toBe('5.0');
  });

  it('2. PDF-only contract applies from its start date (PR-26-00045)', () => {
    const r = row('PR-26-00045');
    expect(r.route).toBe('CONTRACT_PO');
    expect(r.supplier_id).toBe('S021');
    expect(r.unit_price).toBe('2439.01');
    expect(r.group_value_inr).toBe('26829.11');
    expect(r.po_id).toBe('PO-0072');
  });

  it('3. contract ceiling nearly used up -> RFQ at lowest applicable contract rate', () => {
    const a = row('PR-26-00004');
    const b = row('PR-26-00026');
    expect(a.group_id).toBe(b.group_id);
    expect(a.route).toBe('RFQ');
    expect(a.group_value_inr).toBe('220255.60');
    expect(a.suggested_supplier_ids).toBe('S014;S013;S016');
  });

  it('4/14. two contracts -> lowest with ceiling; two requirements on one PO', () => {
    const a = row('PR-26-00034');
    const b = row('PR-26-00032');
    expect(a.group_id).toBe(b.group_id);
    expect(a.route).toBe('CONTRACT_PO');
    expect(a.supplier_id).toBe('S007');
    expect(a.unit_price).toBe('7.06');
    expect(a.group_value_inr).toBe('32546.60');
    expect(a.po_id).toBe('PO-0003');

    const c = row('PR-26-00031');
    const d = row('PR-26-00035');
    expect(c.group_id).toBe(d.group_id);
    expect(c.group_id).not.toBe(a.group_id);
    expect(c.group_value_inr).toBe('23227.40');
    expect(c.po_id).toBe(a.po_id); // consolidated (7.1)
  });

  it('5. split PRs clubbed and bought as one spot PO', () => {
    const rows = ['PR-26-00146', 'PR-26-00144', 'PR-26-00145'].map(row);
    expect(new Set(rows.map((r) => r.group_id)).size).toBe(1);
    expect(rows[0].route).toBe('SPOT_PO');
    expect(rows[0].supplier_id).toBe('S024');
    expect(rows[0].unit_price).toBe('166.41');
    expect(rows[0].group_value_inr).toBe('126471.60');
    expect(rows[0].po_id).toBe('PO-0001');
  });

  it('6. same item at different plants is not clubbed', () => {
    const a = row('PR-26-00106');
    const b = row('PR-26-00103');
    expect(a.group_id).not.toBe(b.group_id);
    expect(a.route).toBe('SPOT_PO');
    expect(a.supplier_id).toBe('S027');
    expect(a.group_value_inr).toBe('156170.30');
    expect(a.po_id).toBe('PO-0002');
  });

  it('7. free-text item matched, spot PO', () => {
    const r = row('PR-26-00088');
    expect(r.resolved_item_code).toBe('ITM-1035');
    expect(r.route).toBe('SPOT_PO');
    expect(r.supplier_id).toBe('S023');
    expect(r.unit_price).toBe('391.82');
    expect(r.group_value_inr).toBe('97955.00');
    expect(r.po_id).toBe('PO-0023');
  });

  it('8. emergency PO up to 5L with history', () => {
    const r = row('PR-26-00059');
    expect(r.route).toBe('EMERGENCY_PO');
    expect(r.supplier_id).toBe('S014');
    expect(r.unit_price).toBe('106.38');
    expect(r.group_value_inr).toBe('253184.40');
    expect(r.po_id).toBe('PO-0024');
  });

  it('9. RFQ with three suggested suppliers', () => {
    const r = row('PR-26-00089');
    expect(r.route).toBe('RFQ');
    expect(r.group_value_inr).toBe('336562.15');
    expect(r.suggested_supplier_ids).toBe('S043;S044;S042');
  });

  it('10. small item never bought -> RFQ with category top-up', () => {
    const r = row('PR-26-00050');
    expect(r.route).toBe('RFQ');
    expect(r.group_value_inr).toBe('80300.00');
    expect(r.suggested_supplier_ids).toBe('S003;S002;S005');
  });

  it('11. RFP at 10L+ with five (here four) suppliers', () => {
    const r = row('PR-26-00100');
    expect(r.route).toBe('RFP');
    expect(r.group_value_inr).toBe('2070780.00');
    expect(r.suggested_supplier_ids).toBe('S020;S017;S019;S018');
  });

  it('12. capex always sourcing, five suppliers', () => {
    const r = row('PR-26-00047');
    expect(r.route).toBe('CAPEX_SOURCING');
    expect(r.group_value_inr).toBe('6036704.08');
    expect(r.suggested_supplier_ids).toBe('S045;S047;S020;S048;S046');
  });

  it('13. new item valued at estimate, no suggestions, not clubbed', () => {
    const r = row('PR-26-00170');
    expect(r.resolved_item_code).toBe('NEW');
    expect(r.route).toBe('NEW_ITEM_SOURCING');
    expect(r.group_value_inr).toBe('141100.00');
    expect(r.suggested_supplier_ids).toBe('');
  });
});

maybe('golden run — full published batch, literal policy', () => {
  beforeAll(() => {
    res = runEngine(loadKit());
  });

  it('processes all 186 lines with a policy version on every decided row', () => {
    expect(res.rows).toHaveLength(186);
    const decided = res.rows.filter((r) => r.route !== 'NOT_PROCESSED');
    expect(decided.every((r) => r.policy_version === '5.0')).toBe(true);
  });

  it('NOT_PROCESSED only for zero quantity and the non-policy plant', () => {
    const np = res.rows.filter((r) => r.route === 'NOT_PROCESSED');
    expect(np.map((r) => r.pr_no).sort()).toEqual(['PR-26-00172', 'PR-26-00173']);
    expect(np.find((r) => r.pr_no === 'PR-26-00172')!.reason).toContain('quantity');
    expect(np.find((r) => r.pr_no === 'PR-26-00173')!.reason).toContain('plant');
  });

  it('keeps blocked suppliers out of every PO and suggestion', () => {
    const blocked = new Set(['S004', 'S008', 'S011']);
    for (const r of res.rows) {
      if (r.supplier_id) expect(blocked.has(r.supplier_id)).toBe(false);
      if (r.suggested_supplier_ids) {
        for (const s of r.suggested_supplier_ids.split(';')) expect(blocked.has(s)).toBe(false);
      }
    }
  });

  it('literal 5.4 reading puts the appended early servo-drive requirement on a spot PO', () => {
    const r = row('PR-26-00174');
    expect(r.route).toBe('SPOT_PO');
    expect(r.supplier_id).toBe('S020');
  });

  it('same-group rows always share one po_id and one value', () => {
    const byGroup = new Map<string, typeof res.rows>();
    for (const r of res.rows) {
      if (!r.group_id) continue;
      const list = byGroup.get(r.group_id) ?? [];
      list.push(r);
      byGroup.set(r.group_id, list);
    }
    for (const [gid, list] of byGroup) {
      const poIds = new Set(list.map((r) => r.po_id));
      const values = new Set(list.map((r) => r.group_value_inr));
      expect(poIds.size, gid).toBe(1);
      expect(values.size, gid).toBe(1);
    }
  });
});
