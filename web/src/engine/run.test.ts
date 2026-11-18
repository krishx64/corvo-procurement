import { describe, it, expect } from 'vitest';
import { decideRequirement } from './decide';
import { assignPos } from './consolidate';
import { runEngine } from './run';
import { toCsv } from './export';
import { loadDefaultPolicy } from './policy';
import type { Contract, ContractLine, EngineInput, Item, PoRecord, RuleContext, Supplier } from './types';

const policy = loadDefaultPolicy();

const ctx = (over: Partial<RuleContext> = {}): RuleContext => ({
  item_type: 'Material',
  item_category: 'Fasteners',
  plant: 'PUN1',
  value: 100000,
  is_emergency: false,
  usable_contract: false,
  bought_from_active_supplier: true,
  item_code: 'ITM-1009',
  uom: 'NOS',
  is_new_item: false,
  ...over,
});

describe('decideRequirement — rule order (5.1-5.6)', () => {
  it('capex wins even when a contract is usable (5.1 before 5.2)', () => {
    const d = decideRequirement(ctx({ item_type: 'Capex', usable_contract: true, value: 5000000 }), policy)!;
    expect(d.route).toBe('CAPEX_SOURCING');
    expect(d.rule.id).toBe('5.1');
  });

  it('usable contract is a PO before any value limit (5.2)', () => {
    const d = decideRequirement(ctx({ usable_contract: true, value: 9000000 }), policy)!;
    expect(d.route).toBe('CONTRACT_PO');
  });

  it('emergency <= 5L with purchase history is an emergency PO (5.3)', () => {
    const d = decideRequirement(ctx({ is_emergency: true, value: 400000, bought_from_active_supplier: true }), policy)!;
    expect(d.route).toBe('EMERGENCY_PO');
  });

  it('emergency above 5L falls through to RFQ (5.5)', () => {
    const d = decideRequirement(ctx({ is_emergency: true, value: 600000, bought_from_active_supplier: true }), policy)!;
    expect(d.route).toBe('RFQ');
  });

  it('spot PO below 2L only with history (5.4)', () => {
    expect(decideRequirement(ctx({ value: 199999, bought_from_active_supplier: true }), policy)!.route).toBe('SPOT_PO');
    expect(decideRequirement(ctx({ value: 199999, bought_from_active_supplier: false }), policy)!.route).toBe('RFQ');
  });

  it('exactly 2L is not a spot PO', () => {
    expect(decideRequirement(ctx({ value: 200000, bought_from_active_supplier: true }), policy)!.route).toBe('RFQ');
  });

  it('RFQ below 10L and RFP at 10L or more (5.5, 5.6)', () => {
    expect(decideRequirement(ctx({ value: 999999.99 }), policy)!.route).toBe('RFQ');
    expect(decideRequirement(ctx({ value: 1000000 }), policy)!.route).toBe('RFP');
  });

  it('new items always go to new-item sourcing (1.2)', () => {
    const d = decideRequirement(ctx({ is_new_item: true, value: 50 }), policy)!;
    expect(d.route).toBe('NEW_ITEM_SOURCING');
  });
});

describe('assignPos — consolidation (7.1-7.2)', () => {
  const r = (id: string, at: string, supplier = 'S007', plant = 'PUN1', route = 'CONTRACT_PO', value = 1000) => ({
    id, first_line_at: at, supplier_id: supplier, plant, route, value,
  });

  it('combines requirements within 24h of the PO first requirement', () => {
    const { poByReq, pos } = assignPos([r('a', '2026-11-02 14:05'), r('b', '2026-11-03 10:30')], policy);
    expect(pos).toHaveLength(1);
    expect(pos[0].po_id).toBe('PO-0001');
    expect(poByReq.get('a')).toBe('PO-0001');
    expect(poByReq.get('b')).toBe('PO-0001');
  });

  it('does not combine beyond 24h — new PO', () => {
    const { poByReq, pos } = assignPos([r('a', '2026-11-02 14:05'), r('c', '2026-11-03 15:00')], policy);
    expect(pos).toHaveLength(2);
    expect(poByReq.get('c')).toBe('PO-0002');
  });

  it('never combines different supplier, plant or route', () => {
    const { pos } = assignPos(
      [r('a', '2026-11-02 14:05'), r('b', '2026-11-02 15:00', 'S006'), r('c', '2026-11-02 15:00', 'S007', 'CHK1'), r('d', '2026-11-02 15:00', 'S007', 'PUN1', 'SPOT_PO')],
      policy,
    );
    expect(pos).toHaveLength(4);
  });

  it('assigns PO numbers sequentially in creation order', () => {
    const { pos } = assignPos([r('a', '2026-11-02 09:00', 'S1'), r('b', '2026-11-02 10:00', 'S2'), r('c', '2026-11-03 12:00', 'S1')], policy);
    expect(pos.map((p) => p.po_id)).toEqual(['PO-0001', 'PO-0002', 'PO-0003']);
  });
});

// ---- end-to-end run on a controlled slice ----
const items: Item[] = [
  { item_code: 'ITM-1009', description: 'Hex bolt M10x40 GR 8.8', uom: 'NOS', category: 'Fasteners', item_type: 'Material', standard_price: 7.5 },
  { item_code: 'ITM-1066', description: 'CMM calibration service', uom: 'JOB', category: 'Testing & Calibration', item_type: 'Service', standard_price: 65000 },
];
const suppliers: Supplier[] = [
  { supplier_id: 'S006', name: 'Unbrako', city: 'Pune', categories: 'Fasteners', status: 'Active', on_time_pct: 92, quality_rating: 4.8 },
  { supplier_id: 'S007', name: 'Precision Fasteners', city: 'Pune', categories: 'Fasteners', status: 'Active', on_time_pct: 88, quality_rating: 2.9 },
  { supplier_id: 'S044', name: 'Metal Testing Labs', city: 'Pune', categories: 'Testing & Calibration', status: 'Active', on_time_pct: 86, quality_rating: 4.6 },
];
const contracts: Contract[] = [
  { contract_id: 'RC-2026-013', supplier_id: 'S007', start_date: '2026-06-01', end_date: '2027-05-31', value_cap: 800000, consumed_value: 250000, source: 'register' },
  { contract_id: 'RC-2026-015', supplier_id: 'S006', start_date: '2026-07-01', end_date: '2027-06-30', value_cap: 500000, consumed_value: 488000, source: 'register' },
];
const contractLines: ContractLine[] = [
  { contract_id: 'RC-2026-013', item_code: 'ITM-1009', description: 'Hex bolt', uom: 'NOS', rate: 7.06 },
  { contract_id: 'RC-2026-015', item_code: 'ITM-1009', description: 'Hex bolt', uom: 'NOS', rate: 6.45 },
];
const poHistory: PoRecord[] = [
  { po_number: '7301', po_date: '2026-10-01', supplier_id: 'S007', item_code: 'ITM-1009', quantity: 1, uom: 'NOS', unit_price: 7.1, plant: 'PUN1', delivered_on_time: true },
];

function baseInput(lines: EngineInput['prLines']): EngineInput {
  return { prLines: lines, items, suppliers, poHistory, contracts, contractLines, policies: [policy], plants: ['PUN1', 'CHK1'] };
}

const line = (over: Partial<EngineInput['prLines'][number]> & { pr_no: string; pr_line: number }): EngineInput['prLines'][number] => ({
  created_at: '2026-11-02 10:00',
  plant: 'PUN1',
  item_code: 'ITM-1009',
  description: 'Hex bolt M10x40 GR 8.8',
  quantity: 100,
  urgency: 'Normal',
  need_by_date: '2026-11-20',
  ...over,
});

describe('runEngine', () => {
  it('runs clubbing, contract selection, decision, consolidation and export rows', () => {
    const input = baseInput([
      line({ pr_no: 'PR-1', pr_line: 1, quantity: 3920, created_at: '2026-11-02 14:05' }),
      line({ pr_no: 'PR-2', pr_line: 1, quantity: 690, created_at: '2026-11-09 18:10' }),
    ]);
    const res = runEngine(input);
    expect(res.requirements).toHaveLength(1);
    const req = res.requirements[0];
    expect(req.route).toBe('CONTRACT_PO');
    expect(req.supplier_id).toBe('S007');
    expect(req.unit_price).toBe(7.06);
    expect(req.value).toBeCloseTo(32546.6, 2);
    expect(req.po_id).toBe('PO-0001');
    expect(req.policy_version).toBe('5.0');
    expect(req.reason).toContain('5.2');
    expect(res.rows).toHaveLength(2);
    expect(res.rows.every((r) => r.group_id === req.group_id)).toBe(true);
  });

  it('marks a PUN2 plant line NOT_PROCESSED with a reason', () => {
    const res = runEngine(baseInput([line({ pr_no: 'PR-9', pr_line: 1, plant: 'PUN2' })]));
    expect(res.rows[0].route).toBe('NOT_PROCESSED');
    expect(res.rows[0].reason.toLowerCase()).toContain('plant');
    expect(res.requirements).toHaveLength(0);
  });

  it('gives new items their own sourcing requirement valued at the estimate, never clubbed', () => {
    const res = runEngine(baseInput([
      line({ pr_no: 'PR-3', pr_line: 1, item_code: null, description: 'Drinking water purifier 50 LPH', quantity: 1, estimated_unit_price: 141100 }),
      line({ pr_no: 'PR-4', pr_line: 1, item_code: null, description: 'Drinking water purifier 50 LPH', quantity: 1, estimated_unit_price: 141100 }),
    ]));
    expect(res.requirements).toHaveLength(2);
    expect(res.requirements[0].route).toBe('NEW_ITEM_SOURCING');
    expect(res.requirements[0].value).toBe(141100);
    expect(res.requirements[0].suggested_supplier_ids).toEqual([]);
  });

  it('NOT_PROCESSED for a new item with no estimate', () => {
    const res = runEngine(baseInput([line({ pr_no: 'PR-5', pr_line: 1, item_code: null, description: 'Unknown gadget', quantity: 1 })]));
    expect(res.rows[0].route).toBe('NOT_PROCESSED');
  });

  it('export rows carry the exact header and blank sourcing fields', () => {
    const res = runEngine(baseInput([line({ pr_no: 'PR-6', pr_line: 1, item_code: 'ITM-1066', description: 'CMM calibration service', quantity: 5, estimated_unit_price: null })]));
    const row = res.rows[0];
    expect(row.route).toBe('RFQ'); // 5 x 65000 = 325000, no contract
    expect(row.decision).toBe('SOURCING_REQUEST');
    expect(row.supplier_id).toBe('');
    expect(row.unit_price).toBe('');
    expect(row.po_id).toBe('');
    expect(row.group_value_inr).toBe('325000.00');
    expect(row.suggested_supplier_ids.length).toBeGreaterThan(0);
    const csv = toCsv(res.rows);
    expect(csv.split('\n')[0]).toBe('pr_no,pr_line,resolved_item_code,group_id,po_id,decision,route,supplier_id,unit_price,group_value_inr,suggested_supplier_ids,policy_version,reason');
  });
});
