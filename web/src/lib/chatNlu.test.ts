import { describe, it, expect } from 'vitest';
import { parseMessage, mergeDraft, missing } from './chatNlu';
import type { Item } from '@/engine/types';

const items: Item[] = [
  { item_code: 'ITM-1048', description: 'Nitrile coated gloves', uom: 'PAIR', category: 'Safety & PPE', item_type: 'Material', standard_price: 95 },
  { item_code: 'ITM-1021', description: 'Ball bearing 6205-2RS', uom: 'NOS', category: 'Bearings & Transmission', item_type: 'Material', standard_price: 210 },
  { item_code: 'ITM-1022', description: 'Ball bearing 6308-ZZ', uom: 'NOS', category: 'Bearings & Transmission', item_type: 'Material', standard_price: 640 },
  { item_code: 'ITM-1044', description: 'VCI bag 600x900', uom: 'NOS', category: 'Packaging', item_type: 'Material', standard_price: 21 },
];
const now = new Date(2026, 10, 18, 9, 0); // Wed 18 Nov 2026 local

describe('parseMessage', () => {
  it('extracts quantity, plant, item and need-by from a natural sentence', () => {
    const r = parseMessage('need 200 nitrile gloves for Chakan by next Friday', items, now);
    expect(r.fields.quantity).toBe(200);
    expect(r.fields.plant).toBe('CHK1');
    expect(r.fields.item_code).toBe('ITM-1048');
    // chrono reads "next Friday" from Wed 18 Nov as the following week's Friday
    expect(r.fields.need_by_date).toBe('2026-11-27');
  });

  it('flags urgency words', () => {
    const r = parseMessage('urgent: 40 vci bags 600x900 for bhosari', items, now);
    expect(r.fields.urgency).toBe('Emergency');
    expect(r.fields.plant).toBe('PUN1');
    expect(r.fields.item_code).toBe('ITM-1044');
  });

  it('does not treat model numbers as quantity', () => {
    const r = parseMessage('need bearing 6308', items, now);
    expect(r.fields.item_code).toBe('ITM-1022');
    expect(r.fields.quantity).toBeUndefined();
  });

  it('marks unknown items as new-item candidates instead of inventing a match', () => {
    const r = parseMessage('need a drinking water purifier', items, now);
    expect(r.fields.item_code).toBeUndefined();
    expect(r.newItemQuery).toContain('water purifier');
  });

  it('asks for missing slots', () => {
    const r = parseMessage('need 200 nitrile gloves', items, now);
    const d = mergeDraft({}, r);
    expect(missing(d)).toContain('plant');
    expect(missing(d)).toContain('need_by_date');
  });

  it('does not bind an ambiguous match — offers candidates instead', () => {
    const r = parseMessage('need ball bearing', items, now);
    const d = mergeDraft({}, r);
    expect(d.item_code).toBeUndefined();
    expect(d.candidates?.length).toBeGreaterThan(1);
  });

  it('an explicit item code overrides ambiguity', () => {
    const r = parseMessage('ITM-1021 ball bearing', items, now);
    const d = mergeDraft({}, r);
    expect(d.item_code).toBe('ITM-1021');
  });
});
