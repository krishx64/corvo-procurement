import { describe, it, expect } from 'vitest';
import { clubLines } from './club';
import { loadDefaultPolicy } from './policy';
import type { Item, PrLineInput } from './types';

const policy = loadDefaultPolicy();

const bearing: Item = { item_code: 'ITM-1038', description: 'Hydraulic oil HLP 68', uom: 'LTR', category: 'Hydraulics & Pneumatics', item_type: 'Material', standard_price: 165 };
const vci: Item = { item_code: 'ITM-1044', description: 'VCI bag 600x900', uom: 'NOS', category: 'Packaging', item_type: 'Material', standard_price: 21 };

function line(over: Partial<PrLineInput> & { pr_no: string; pr_line?: number }): PrLineInput {
  return {
    pr_line: 1,
    created_at: '2026-11-02 09:00',
    plant: 'CHK1',
    item_code: null,
    description: 'Hydraulic oil HLP 68',
    quantity: 10,
    urgency: 'Normal',
    need_by_date: '2026-11-20',
    ...over,
  };
}

function resolvedFor(lines: PrLineInput[], item: Item | undefined) {
  const m = new Map<string, Item | undefined>();
  for (const l of lines) m.set(`${l.pr_no}/${l.pr_line}`, item);
  return m;
}

describe('clubLines', () => {
  it('clubs the three split hydraulic-oil PRs into one requirement (worked example 5)', () => {
    const lines = [
      line({ pr_no: 'PR-26-00146', created_at: '2026-11-02 09:40', quantity: 270, need_by_date: '2026-11-19' }),
      line({ pr_no: 'PR-26-00144', created_at: '2026-11-03 09:30', quantity: 190, need_by_date: '2026-11-15' }),
      line({ pr_no: 'PR-26-00145', created_at: '2026-11-05 08:40', quantity: 300, need_by_date: '2026-11-21' }),
    ];
    const { requirements } = clubLines(lines, resolvedFor(lines, bearing), policy);
    expect(requirements).toHaveLength(1);
    expect(requirements[0].total_qty).toBe(760);
    expect(requirements[0].lines).toHaveLength(3);
  });

  it('does not club across plants (worked example 6)', () => {
    const lines = [
      line({ pr_no: 'PR-26-00106', created_at: '2026-11-02 12:00', plant: 'PUN1', quantity: 7370, need_by_date: '2027-02-19' }),
      line({ pr_no: 'PR-26-00103', created_at: '2026-11-05 08:50', plant: 'CHK1', quantity: 6480, need_by_date: '2027-03-04' }),
    ];
    const { requirements } = clubLines(lines, resolvedFor(lines, vci), policy);
    expect(requirements).toHaveLength(2);
  });

  it('joins on the 14th calendar day but not the 15th', () => {
    const lines = [
      line({ pr_no: 'P1', created_at: '2026-11-02 09:00', quantity: 1, need_by_date: '2026-11-20' }),
      line({ pr_no: 'P2', created_at: '2026-11-16 09:00', quantity: 2, need_by_date: '2026-11-20' }),
      line({ pr_no: 'P3', created_at: '2026-11-17 09:00', quantity: 4, need_by_date: '2026-11-20' }),
    ];
    const { requirements } = clubLines(lines, resolvedFor(lines, bearing), policy);
    // P2 joins P1; P3 is 15 days after P1's first line -> new requirement
    expect(requirements.map((r) => r.total_qty).sort((a, b) => a - b)).toEqual([3, 4]);
  });

  it('joins with need-by exactly 7 days apart but not 8', () => {
    const lines = [
      line({ pr_no: 'P1', created_at: '2026-11-02 09:00', quantity: 1, need_by_date: '2026-11-20' }),
      line({ pr_no: 'P2', created_at: '2026-11-03 09:00', quantity: 2, need_by_date: '2026-11-27' }),
      line({ pr_no: 'P3', created_at: '2026-11-04 09:00', quantity: 4, need_by_date: '2026-11-28' }),
    ];
    const { requirements } = clubLines(lines, resolvedFor(lines, bearing), policy);
    // P3's need-by is 8 days from P1's (first-line) need-by -> separate
    expect(requirements.map((r) => r.total_qty).sort((a, b) => a - b)).toEqual([3, 4]);
  });

  it('joins the earliest qualifying requirement when several match (2.2)', () => {
    const lines = [
      line({ pr_no: 'A', created_at: '2026-11-02 09:00', quantity: 1, need_by_date: '2026-11-15' }),
      line({ pr_no: 'B', created_at: '2026-11-03 09:00', quantity: 2, need_by_date: '2026-11-25' }),
      line({ pr_no: 'C', created_at: '2026-11-04 09:00', quantity: 4, need_by_date: '2026-11-20' }),
    ];
    const { requirements } = clubLines(lines, resolvedFor(lines, bearing), policy);
    expect(requirements).toHaveLength(2);
    const a = requirements.find((r) => r.lines.some((l) => l.pr_no === 'A'))!;
    expect(a.lines.map((l) => l.pr_no)).toEqual(['A', 'C']);
  });

  it('never clubs new items, even with identical descriptions', () => {
    const lines = [
      line({ pr_no: 'P1', created_at: '2026-11-02 09:00', description: 'Drinking water purifier 50 LPH', quantity: 1 }),
      line({ pr_no: 'P2', created_at: '2026-11-03 09:00', description: 'Drinking water purifier 50 LPH', quantity: 1 }),
    ];
    const { requirements } = clubLines(lines, resolvedFor(lines, undefined), policy);
    expect(requirements).toHaveLength(2);
  });

  it('marks the whole requirement emergency if any line is emergency (2.3)', () => {
    const lines = [
      line({ pr_no: 'P1', created_at: '2026-11-02 09:00', quantity: 1 }),
      line({ pr_no: 'P2', created_at: '2026-11-03 09:00', quantity: 2, urgency: 'Emergency' }),
    ];
    const { requirements } = clubLines(lines, resolvedFor(lines, bearing), policy);
    expect(requirements).toHaveLength(1);
    expect(requirements[0].is_emergency).toBe(true);
  });

  it('orders lines by creation time, then PR number, then line number', () => {
    const lines = [
      line({ pr_no: 'PR-2', pr_line: 2, created_at: '2026-11-02 09:00', quantity: 20 }),
      line({ pr_no: 'PR-1', pr_line: 1, created_at: '2026-11-02 09:00', quantity: 1 }),
      line({ pr_no: 'PR-1', pr_line: 2, created_at: '2026-11-02 09:00', quantity: 2 }),
    ];
    const { requirements } = clubLines(lines, resolvedFor(lines, bearing), policy);
    expect(requirements[0].lines.map((l) => `${l.pr_no}/${l.pr_line}`)).toEqual(['PR-1/1', 'PR-1/2', 'PR-2/2']);
  });
});
