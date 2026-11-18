import { describe, it, expect } from 'vitest';
import { applicableContracts, selectContract } from './contracts';
import { valueRequirement } from './value';
import { loadDefaultPolicy } from './policy';
import type { Contract, ContractLine, Item, PoRecord, Supplier } from './types';

const policy = loadDefaultPolicy();

const suppliers: Supplier[] = [
  { supplier_id: 'S004', name: 'Metalink Alloys', city: 'Nashik', categories: 'Steel & Metals', status: 'Blocked', on_time_pct: 88, quality_rating: 4.7 },
  { supplier_id: 'S006', name: 'Unbrako Fastener Distributors', city: 'Pune', categories: 'Fasteners', status: 'Active', on_time_pct: 92, quality_rating: 4.8 },
  { supplier_id: 'S007', name: 'Precision Fasteners Co', city: 'Pune', categories: 'Fasteners', status: 'Active', on_time_pct: 88, quality_rating: 2.9 },
  { supplier_id: 'S013', name: 'Industrial Bearings Co', city: 'Pune', categories: 'Bearings & Transmission', status: 'Active', on_time_pct: 76, quality_rating: 3.2 },
  { supplier_id: 'S024', name: 'Janatics Dealer Chakan', city: 'Chakan', categories: 'Hydraulics & Pneumatics', status: 'Active', on_time_pct: 89, quality_rating: 4.1 },
];

const contracts: Contract[] = [
  { contract_id: 'RC-2026-002', supplier_id: 'S013', start_date: '2026-01-01', end_date: '2026-12-31', value_cap: 1200000, consumed_value: 1162000, source: 'register' },
  { contract_id: 'RC-2026-005', supplier_id: 'S004', start_date: '2026-02-01', end_date: '2027-01-31', value_cap: 3500000, consumed_value: 900000, source: 'register' },
  { contract_id: 'RC-2026-013', supplier_id: 'S007', start_date: '2026-06-01', end_date: '2027-05-31', value_cap: 800000, consumed_value: 250000, source: 'register' },
  { contract_id: 'RC-2026-015', supplier_id: 'S006', start_date: '2026-07-01', end_date: '2027-06-30', value_cap: 500000, consumed_value: 488000, source: 'register' },
];

const contractLines: ContractLine[] = [
  { contract_id: 'RC-2026-002', item_code: 'ITM-1022', description: 'Ball bearing 6308-ZZ', uom: 'NOS', rate: 579.62 },
  { contract_id: 'RC-2026-005', item_code: 'ITM-1006', description: 'Aluminium plate 6061 10mm', uom: 'KG', rate: 329.54 },
  { contract_id: 'RC-2026-013', item_code: 'ITM-1009', description: 'Hex bolt M10x40 GR 8.8', uom: 'NOS', rate: 7.06 },
  { contract_id: 'RC-2026-015', item_code: 'ITM-1009', description: 'Hex bolt M10x40 GR 8.8', uom: 'NOS', rate: 6.45 },
];

const item = (over: Partial<Item> & { item_code: string }): Item => ({
  description: 'x', uom: 'NOS', category: 'x', item_type: 'Material', standard_price: 100, ...over,
});

const po = (over: Partial<PoRecord> & { po_number: string; po_date: string }): PoRecord => ({
  supplier_id: 'S024', item_code: 'ITM-1038', quantity: 1, uom: 'LTR', unit_price: 100, plant: 'CHK1', delivered_on_time: true, ...over,
});

const noConsumed = new Map<string, number>();

describe('applicableContracts (4.1)', () => {
  it('excludes contracts whose supplier is Blocked even if the item and dates fit', () => {
    const opts = applicableContracts('ITM-1006', '2026-11-02', contracts, contractLines, suppliers, policy);
    expect(opts).toHaveLength(0);
  });

  it('excludes contracts outside their date range', () => {
    const opts = applicableContracts('ITM-1022', '2027-01-15', contracts, contractLines, suppliers, policy);
    expect(opts).toHaveLength(0);
  });

  it('includes contracts valid on the requirement date inclusive', () => {
    expect(applicableContracts('ITM-1022', '2026-01-01', contracts, contractLines, suppliers, policy)).toHaveLength(1);
    expect(applicableContracts('ITM-1022', '2026-12-31', contracts, contractLines, suppliers, policy)).toHaveLength(1);
  });
});

describe('selectContract (4.2, 4.3)', () => {
  it('picks the lowest-rate contract that still has ceiling (worked example 4)', () => {
    // 4610 hex bolts: RC-2026-015 @6.45 has only 12000 left -> 48710 needed; RC-2026-013 @7.06 has room
    const sel = selectContract('ITM-1009', '2026-11-02', 4610, contracts, contractLines, suppliers, policy, noConsumed);
    expect(sel.selected?.contract.contract_id).toBe('RC-2026-013');
    expect(sel.selected?.rate).toBe(7.06);
  });

  it('reports all applicable contracts out of ceiling and the lowest applicable rate (worked example 3)', () => {
    // 380 bearings @579.62 = 220255.6 but only 38000 ceiling left
    const sel = selectContract('ITM-1022', '2026-11-02', 380, contracts, contractLines, suppliers, policy, noConsumed);
    expect(sel.selected).toBeUndefined();
    expect(sel.lowestApplicableRate).toBe(579.62);
    expect(sel.applicable).toHaveLength(1);
  });

  it('consumes ceiling committed earlier in the same run (4.2 ordering)', () => {
    const consumed = new Map([['RC-2026-013', 600000]]); // 250k register + 600k this run
    const sel = selectContract('ITM-1009', '2026-11-02', 4610, contracts, contractLines, suppliers, policy, consumed);
    expect(sel.selected).toBeUndefined();
    expect(sel.lowestApplicableRate).toBe(6.45);
  });
});

describe('valueRequirement (3.1)', () => {
  it('uses the selected contract rate when a contract can be used', () => {
    const sel = selectContract('ITM-1009', '2026-11-02', 4610, contracts, contractLines, suppliers, policy, noConsumed);
    const v = valueRequirement(4610, '2026-11-02', item({ item_code: 'ITM-1009', standard_price: 7.5 }), sel, [], policy);
    expect(v.unit_price).toBe(7.06);
    expect(v.basis).toBe('contract');
  });

  it('uses the lowest applicable contract rate when every applicable contract is out of ceiling', () => {
    const sel = selectContract('ITM-1022', '2026-11-02', 380, contracts, contractLines, suppliers, policy, noConsumed);
    const v = valueRequirement(380, '2026-11-02', item({ item_code: 'ITM-1022', standard_price: 640 }), sel, [], policy);
    expect(v.unit_price).toBe(579.62);
    expect(v.basis).toBe('contract_out_of_ceiling');
  });

  it('falls back to the most recent PO price within 365 days', () => {
    const history = [
      po({ po_number: '7301', po_date: '2026-07-06', unit_price: 177.94 }),
      po({ po_number: '7302', po_date: '2026-10-19', unit_price: 166.41 }),
      po({ po_number: '7303', po_date: '2026-02-15', unit_price: 183.78 }),
    ];
    const sel = selectContract('ITM-1038', '2026-11-02', 760, contracts, contractLines, suppliers, policy, noConsumed);
    const v = valueRequirement(760, '2026-11-02', item({ item_code: 'ITM-1038', standard_price: 165 }), sel, history, policy);
    expect(v.unit_price).toBe(166.41);
    expect(v.basis).toBe('po');
    expect(v.ref_po_number).toBe('7302');
  });

  it('ignores PO history older than 365 days', () => {
    const history = [po({ po_number: '7301', po_date: '2025-06-01', unit_price: 177.94 })];
    const sel = selectContract('ITM-1038', '2026-11-02', 10, contracts, contractLines, suppliers, policy, noConsumed);
    const v = valueRequirement(10, '2026-11-02', item({ item_code: 'ITM-1038', standard_price: 165 }), sel, history, policy);
    expect(v.unit_price).toBe(165);
    expect(v.basis).toBe('standard');
  });

  it('uses the item master standard price when no contract and no PO', () => {
    const sel = selectContract('ITM-1006', '2026-11-02', 220, contracts, contractLines, suppliers, policy, noConsumed);
    const v = valueRequirement(220, '2026-11-02', item({ item_code: 'ITM-1006', standard_price: 365 }), sel, [], policy);
    expect(v.unit_price).toBe(365);
    expect(v.basis).toBe('standard');
  });
});
