import { describe, it, expect } from 'vitest';
import { preferredList, suggestionsFor } from './preferred';
import { loadDefaultPolicy } from './policy';
import type { Contract, ContractLine, Item, PoRecord, Supplier } from './types';

const policy = loadDefaultPolicy();
const ASOF = '2026-11-01';
const ASOF_1102 = '2026-11-02';

const S = (id: string, status: Supplier['status'], ot: number, q: number, categories = 'Misc'): Supplier => ({
  supplier_id: id, name: id, city: 'Pune', categories, status, on_time_pct: ot, quality_rating: q,
});

const suppliers: Supplier[] = [
  S('S001', 'Active', 87, 3.3, 'Steel & Metals'),
  S('S002', 'Active', 79, 4.5, 'Steel & Metals'),
  S('S003', 'Active', 98, 4.6, 'Steel & Metals'),
  S('S004', 'Blocked', 88, 4.7, 'Steel & Metals'),
  S('S005', 'Active', 68, 4.6, 'Steel & Metals'),
  S('S009', 'Active', 83, 4.6, 'Welding Consumables'),
  S('S010', 'Active', 80, 3.9, 'Welding Consumables'),
  S('S020', 'Active', 92, 3.3, 'Electrical Spares;Capital Equipment'),
  S('S021', 'Active', 73, 4.6, 'Hydraulics & Pneumatics'),
  S('S022', 'Active', 77, 3.5, 'Hydraulics & Pneumatics'),
  S('S023', 'Active', 74, 3.9, 'Hydraulics & Pneumatics'),
  S('S024', 'Active', 89, 4.1, 'Hydraulics & Pneumatics'),
  S('S029', 'Active', 81, 3.1, 'Safety & PPE'),
  S('S030', 'Active', 72, 3.4, 'Safety & PPE'),
  S('S031', 'Inactive', 78, 3.4, 'Safety & PPE'),
  S('S042', 'Active', 68, 4.0, 'Testing & Calibration'),
  S('S043', 'Active', 81, 3.6, 'Testing & Calibration'),
  S('S044', 'Active', 86, 4.6, 'Testing & Calibration'),
  S('S045', 'Active', 82, 2.9, 'Capital Equipment'),
  S('S046', 'Active', 73, 4.1, 'Capital Equipment'),
  S('S047', 'Active', 98, 3.2, 'Capital Equipment'),
  S('S048', 'Active', 92, 3.3, 'Capital Equipment'),
];

const P = (item: string, supplier: string, date: string, price: number, n: string): PoRecord => ({
  po_number: n, po_date: date, supplier_id: supplier, item_code: item, quantity: 1, uom: 'NOS', unit_price: price, plant: 'PUN1', delivered_on_time: true,
});

const poHistory: PoRecord[] = [
  // ITM-1048 (example list): S029 7 POs, S030 4 POs, S031 2 POs (Inactive)
  ...Array.from({ length: 7 }, (_, i) => P('ITM-1048', 'S029', `2026-0${(i % 8) + 1}-1${i % 9}`, 94 + i * 0.1, `80${i}`)),
  P('ITM-1048', 'S029', '2026-09-26', 94.0, '8099'),
  ...Array.from({ length: 4 }, (_, i) => P('ITM-1048', 'S030', `2026-0${i + 5}-1${i}`, 89.6, `81${i}`)),
  P('ITM-1048', 'S030', '2026-10-23', 89.62, '8199'),
  P('ITM-1048', 'S031', '2026-06-12', 96.03, '8200'),
  P('ITM-1048', 'S031', '2026-05-01', 97.03, '8201'),
  // ITM-1036 (example list): S023 2 recent, S022 2 with old last, S024 1 very old
  P('ITM-1036', 'S023', '2026-09-30', 4360.8, '8300'),
  P('ITM-1036', 'S023', '2026-05-15', 4400.0, '8301'),
  P('ITM-1036', 'S022', '2026-01-09', 4232.09, '8302'),
  P('ITM-1036', 'S022', '2025-12-01', 4299.0, '8303'),
  P('ITM-1036', 'S024', '2025-09-30', 3700.35, '8304'),
  // ITM-1016 (example list): both 1 PO, S009 holds contract
  P('ITM-1016', 'S009', '2026-01-28', 135.05, '8400'),
  P('ITM-1016', 'S010', '2026-03-11', 123.74, '8401'),
  // ITM-1038: S023 6 POs, S024 4 recent, S022 3, S021 1 recent
  ...Array.from({ length: 6 }, (_, i) => P('ITM-1038', 'S023', `2025-${String((i % 12) + 1).padStart(2, '0')}-10`, 180 + i, `85${i}`)),
  P('ITM-1038', 'S023', '2026-02-15', 183.78, '8599'),
  ...Array.from({ length: 4 }, (_, i) => P('ITM-1038', 'S024', `2026-0${i + 4}-12`, 170 + i, `86${i}`)),
  P('ITM-1038', 'S024', '2026-10-19', 166.41, '8699'),
  ...Array.from({ length: 3 }, (_, i) => P('ITM-1038', 'S022', `2026-0${i + 4}-20`, 176 + i, `87${i}`)),
  P('ITM-1038', 'S022', '2026-07-06', 177.94, '8799'),
  P('ITM-1038', 'S021', '2026-08-21', 184.42, '8800'),
  // ITM-1071: only S045 bought it
  P('ITM-1071', 'S045', '2026-08-29', 1509176.02, '8900'),
  // ITM-1066: S043 5, S044 1
  ...Array.from({ length: 5 }, (_, i) => P('ITM-1066', 'S043', `2026-0${i + 5}-07`, 67000 + i * 100, `90${i}`)),
  P('ITM-1066', 'S043', '2026-10-07', 67312.43, '9099'),
  P('ITM-1066', 'S044', '2026-07-11', 66404.67, '9100'),
];

const contracts: Contract[] = [
  { contract_id: 'RC-2025-014', supplier_id: 'S009', start_date: '2025-12-01', end_date: '2026-11-30', value_cap: 1500000, consumed_value: 640000, source: 'register' },
  { contract_id: 'RC-2026-005', supplier_id: 'S004', start_date: '2026-02-01', end_date: '2027-01-31', value_cap: 3500000, consumed_value: 900000, source: 'register' },
  { contract_id: 'RC-2026-007', supplier_id: 'S029', start_date: '2026-01-01', end_date: '2026-12-31', value_cap: 1500000, consumed_value: 300000, source: 'register' },
];
const contractLines: ContractLine[] = [
  { contract_id: 'RC-2025-014', item_code: 'ITM-1016', description: 'MIG wire', uom: 'KG', rate: 115.26 },
  { contract_id: 'RC-2026-005', item_code: 'ITM-1006', description: 'Aluminium plate', uom: 'KG', rate: 329.54 },
  { contract_id: 'RC-2026-007', item_code: 'ITM-1048', description: 'Nitrile gloves', uom: 'PAIR', rate: 90.32 },
];

const item = (code: string, category: string, type = 'Material'): Item => ({
  item_code: code, description: code, uom: 'NOS', category, item_type: type, standard_price: 100,
});

describe('preferredList (6.1-6.3)', () => {
  it('ranks S029 above S030 and excludes Inactive S031 (worked example list 1)', () => {
    const list = preferredList('ITM-1048', ASOF, suppliers, poHistory, contracts, contractLines, policy);
    expect(list.map((e) => e.supplier_id)).toEqual(['S029', 'S030']);
    expect(list[0].reference_price).toBe(94.0);
    expect(list[0].ref_source).toBe('po');
  });

  it('orders S023 > S022 > S024 (worked example list 2)', () => {
    const list = preferredList('ITM-1036', ASOF, suppliers, poHistory, contracts, contractLines, policy);
    expect(list.map((e) => e.supplier_id)).toEqual(['S023', 'S022', 'S024']);
  });

  it('contract holding breaks the tie S009 > S010 (worked example list 3)', () => {
    const list = preferredList('ITM-1016', ASOF, suppliers, poHistory, contracts, contractLines, policy);
    expect(list.map((e) => e.supplier_id)).toEqual(['S009', 'S010']);
    expect(list[0].has_contract).toBe(true);
  });

  it('puts the most recent buyer first even with fewer POs (worked example 5: S024 beats S023)', () => {
    const list = preferredList('ITM-1038', ASOF_1102, suppliers, poHistory, contracts, contractLines, policy);
    expect(list[0].supplier_id).toBe('S024');
    expect(list[0].reference_price).toBe(166.41);
  });

  it('includes a contract-only supplier with contract rate as reference price', () => {
    const list = preferredList('ITM-1016', ASOF, suppliers, poHistory, contracts, contractLines, policy);
    expect(list[0].po_count).toBe(1);
    const onlyContractSuppliers = preferredList('ITM-1006', ASOF, suppliers, poHistory, contracts, contractLines, policy);
    // S004 is the only contract holder but is Blocked -> excluded entirely
    expect(onlyContractSuppliers).toHaveLength(0);
  });

  it('reference price falls back to the most recent contract rate when a supplier has no PO', () => {
    const extra: Contract[] = [{ contract_id: 'RC-X', supplier_id: 'S002', start_date: '2026-03-01', end_date: '2027-03-01', value_cap: 100000, consumed_value: 0, source: 'pdf' }];
    const lines: ContractLine[] = [{ contract_id: 'RC-X', item_code: 'ITM-1006', description: 'Aluminium plate', uom: 'KG', rate: 355.5 }];
    const list = preferredList('ITM-1006', ASOF, suppliers, poHistory, [...contracts, ...extra], [...contractLines, ...lines], policy);
    expect(list.map((e) => e.supplier_id)).toEqual(['S002']);
    expect(list[0].reference_price).toBe(355.5);
    expect(list[0].ref_source).toBe('contract');
  });
});

describe('suggestionsFor (6.4)', () => {
  it('tops up RFQ suggestions from the category by on-time x quality (worked example 10)', () => {
    const sug = suggestionsFor(item('ITM-1006', 'Steel & Metals'), ASOF_1102, 3, suppliers, poHistory, contracts, contractLines, policy);
    expect(sug).toEqual(['S003', 'S002', 'S005']);
  });

  it('builds the Capex 5-supplier list (worked example 12)', () => {
    const sug = suggestionsFor(item('ITM-1071', 'Capital Equipment', 'Capex'), ASOF_1102, 5, suppliers, poHistory, contracts, contractLines, policy);
    expect(sug).toEqual(['S045', 'S047', 'S020', 'S048', 'S046']);
  });

  it('builds the RFQ 3-supplier list for CMM calibration (worked example 9)', () => {
    const sug = suggestionsFor(item('ITM-1066', 'Testing & Calibration', 'Service'), ASOF_1102, 3, suppliers, poHistory, contracts, contractLines, policy);
    expect(sug).toEqual(['S043', 'S044', 'S042']);
  });

  it('returns no suggestions for new items', () => {
    expect(suggestionsFor(undefined, ASOF_1102, 3, suppliers, poHistory, contracts, contractLines, policy)).toEqual([]);
  });
});
