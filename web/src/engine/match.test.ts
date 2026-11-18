import { describe, it, expect } from 'vitest';
import { matchItem } from './match';

// Minimal item fixtures — only what the worked examples need.
const items = [
  { item_code: 'ITM-1001', description: 'MS sheet 2mm 1250x2500', uom: 'NOS', category: 'Steel & Metals', item_type: 'Material', standard_price: 6800 },
  { item_code: 'ITM-1002', description: 'MS sheet 3mm 1250x2500', uom: 'NOS', category: 'Steel & Metals', item_type: 'Material', standard_price: 9900 },
  { item_code: 'ITM-1006', description: 'Aluminium plate 6061 10mm', uom: 'KG', category: 'Steel & Metals', item_type: 'Material', standard_price: 365 },
  { item_code: 'ITM-1009', description: 'Hex bolt M10x40 GR 8.8', uom: 'NOS', category: 'Fasteners', item_type: 'Material', standard_price: 7.5 },
  { item_code: 'ITM-1015', description: 'Welding electrode E6013 3.15mm', uom: 'KG', category: 'Welding Consumables', item_type: 'Material', standard_price: 165 },
  { item_code: 'ITM-1016', description: 'MIG wire ER70S-6 1.2mm', uom: 'KG', category: 'Welding Consumables', item_type: 'Material', standard_price: 128 },
  { item_code: 'ITM-1020', description: 'Cutting wheel 14 inch', uom: 'NOS', category: 'Welding Consumables', item_type: 'Material', standard_price: 210 },
  { item_code: 'ITM-1021', description: 'Ball bearing 6205-2RS', uom: 'NOS', category: 'Bearings & Transmission', item_type: 'Material', standard_price: 210 },
  { item_code: 'ITM-1022', description: 'Ball bearing 6308-ZZ', uom: 'NOS', category: 'Bearings & Transmission', item_type: 'Material', standard_price: 640 },
  { item_code: 'ITM-1023', description: 'Taper roller bearing 32210', uom: 'NOS', category: 'Bearings & Transmission', item_type: 'Material', standard_price: 1450 },
  { item_code: 'ITM-1024', description: 'V-belt B-54', uom: 'NOS', category: 'Bearings & Transmission', item_type: 'Material', standard_price: 330 },
  { item_code: 'ITM-1035', description: 'Hydraulic hose 1/2 inch 2 wire', uom: 'MTR', category: 'Hydraulics & Pneumatics', item_type: 'Material', standard_price: 420 },
  { item_code: 'ITM-1036', description: 'Pneumatic cylinder 50x100', uom: 'NOS', category: 'Hydraulics & Pneumatics', item_type: 'Material', standard_price: 3900 },
  { item_code: 'ITM-1038', description: 'Hydraulic oil HLP 68', uom: 'LTR', category: 'Hydraulics & Pneumatics', item_type: 'Material', standard_price: 165 },
  { item_code: 'ITM-1039', description: 'FRL unit 1/2 inch', uom: 'NOS', category: 'Hydraulics & Pneumatics', item_type: 'Material', standard_price: 2900 },
  { item_code: 'ITM-1040', description: 'Hydraulic pump seal kit (Hydrax)', uom: 'SET', category: 'Hydraulics & Pneumatics', item_type: 'Material', standard_price: 18500 },
  { item_code: 'ITM-1044', description: 'VCI bag 600x900', uom: 'NOS', category: 'Packaging', item_type: 'Material', standard_price: 21 },
  { item_code: 'ITM-1048', description: 'Nitrile coated gloves', uom: 'PAIR', category: 'Safety & PPE', item_type: 'Material', standard_price: 95 },
  { item_code: 'ITM-1050', description: 'Safety goggles clear', uom: 'NOS', category: 'Safety & PPE', item_type: 'Material', standard_price: 120 },
  { item_code: 'ITM-1057', description: '24 inch monitor', uom: 'NOS', category: 'Office & IT', item_type: 'Material', standard_price: 11500 },
  { item_code: 'ITM-1066', description: 'CMM calibration service', uom: 'JOB', category: 'Testing & Calibration', item_type: 'Service', standard_price: 65000 },
  { item_code: 'ITM-1071', description: 'EOT crane 5 ton', uom: 'NOS', category: 'Capital Equipment', item_type: 'Capex', standard_price: 1450000 },
];

function codeFor(desc: string): string | undefined {
  return matchItem(desc, items).item?.item_code;
}

describe('matchItem', () => {
  it('matches abbreviated free text to the item master', () => {
    expect(codeFor('brg 6308 ZZ for maintenance')).toBe('ITM-1022');
    expect(codeFor('hyd hose 1/2 inch 2 wire')).toBe('ITM-1035');
    expect(codeFor('eot crane 5 ton')).toBe('ITM-1071');
    expect(codeFor('CMM calibration service')).toBe('ITM-1066');
    expect(codeFor('monitor 24"')).toBe('ITM-1057');
    expect(codeFor('v-belt b-54')).toBe('ITM-1024');
    expect(codeFor('welding rod e6013 3.15mm')).toBe('ITM-1015');
    expect(codeFor('taper roller brg 32210')).toBe('ITM-1023');
    expect(codeFor('pneu cylinder 50x100')).toBe('ITM-1036');
    expect(codeFor('hydraulic pump seal kit (hydrax) (repeat)')).toBe('ITM-1040');
    expect(codeFor('nitrile coated gloves - urgent')).toBe('ITM-1048');
    expect(codeFor('FRL unit 1/2 inch as per sample')).toBe('ITM-1039');
  });

  it('never invents a match for genuinely unknown items', () => {
    expect(matchItem('Drinking water purifier 50 LPH', items).item).toBeUndefined();
    expect(matchItem('Ultrasonic thickness gauge', items).item).toBeUndefined();
    expect(matchItem('Office chair ergonomic', items).item).toBeUndefined();
    // numeric mismatch must not silently match a different grade/size
    expect(matchItem('Hydraulic oil HLP 46', items).item).toBeUndefined();
  });

  it('flags ambiguous shorthand instead of silently guessing', () => {
    const r = matchItem('ball bearing', items);
    expect(r.ambiguous).toBe(true);
  });

  it('scores exact descriptions 1.0', () => {
    expect(matchItem('Nitrile coated gloves', items).score).toBeCloseTo(1, 5);
  });
});
