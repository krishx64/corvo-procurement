import { describe, it, expect } from 'vitest';
import { moneyToNumber, parseAmendment, plainPolicy } from './amendment';
import { loadDefaultPolicy } from './policy';

const policy = loadDefaultPolicy();

describe('moneyToNumber', () => {
  it('parses Indian money formats', () => {
    expect(moneyToNumber('₹5,00,000')).toBe(500000);
    expect(moneyToNumber('5 lakh')).toBe(500000);
    expect(moneyToNumber('1.2 crore')).toBe(12000000);
    expect(moneyToNumber('500000')).toBe(500000);
    expect(moneyToNumber('15L')).toBe(1500000);
  });
});

describe('parseAmendment', () => {
  it('changes a rule limit when old and new amounts are given', () => {
    const r = parseAmendment('In rule 5.4, replace ₹2,00,000 with ₹3,00,000 for spot purchases.', policy);
    const rule = r.proposed.decision_rules.find((x) => x.id === '5.4')!;
    expect(rule.conditions.find((c) => c.field === 'value')!.value).toBe(300000);
    expect(r.changes[0].kind).toBe('limit');
    expect(r.changes[0].plain).toContain('₹3,00,000');
  });

  it('handles amendments without a currency glyph and sentences that contain rule decimals', () => {
    const r = parseAmendment('In rule 5.4, replace 2,00,000 with 3,00,000. New rule 5.4A: for plant CHK1, value under 6,00,000 and bought from an Active supplier in the last 365 days, create a spot PO.', policy);
    expect(r.proposed.decision_rules.find((x) => x.id === '5.4')!.conditions.find((c) => c.field === 'value')!.value).toBe(300000);
    const added = r.proposed.decision_rules.find((x) => x.id === '5.4A')!;
    expect(added.conditions).toContainEqual({ field: 'value', op: 'lt', value: 600000 });
    expect(added.conditions).toContainEqual({ field: 'plant', op: 'eq', value: 'CHK1' });
    expect(r.unparsed).toHaveLength(0);
  });

  it('adds a plant-scoped new rule before the base rule', () => {
    const text = 'New rule 5.4A: for plant CHK1, value below ₹5,00,000 and bought from an Active supplier in the last 365 days, create a spot PO.';
    const r = parseAmendment(text, policy);
    const added = r.proposed.decision_rules.find((x) => x.id === '5.4A')!;
    expect(added.route).toBe('SPOT_PO');
    expect(added.conditions).toContainEqual({ field: 'plant', op: 'eq', value: 'CHK1' });
    expect(added.conditions).toContainEqual({ field: 'value', op: 'lt', value: 500000 });
    expect(added.priority).toBeLessThan(4);
    expect(r.unparsed).toHaveLength(0);
  });

  it('changes clubbing windows', () => {
    const r = parseAmendment('The clubbing window is extended to 21 days.', policy);
    expect(r.proposed.clubbing.creation_window_days).toBe(21);
  });

  it('changes the RFQ/RFP thresholds by route keyword', () => {
    const r = parseAmendment('The RFP threshold is now ₹15,00,000.', policy);
    const rfp = r.proposed.decision_rules.find((x) => x.route === 'RFP')!;
    expect(rfp.conditions.find((c) => c.field === 'value')!.value).toBe(1500000);
  });

  it('turns a chat-style scoped instruction into a plant-scoped rule, not a global change', () => {
    const r = parseAmendment('for CHK1, allow spot purchases up to 6,00,000', policy);
    const base = r.proposed.decision_rules.find((x) => x.id === '5.4')!;
    expect(base.conditions.find((c) => c.field === 'value')!.value).toBe(200000); // unchanged
    const scoped = r.proposed.decision_rules.find((x) => x.id.startsWith('5.4') && x.id !== '5.4')!;
    expect(scoped.id).toBe('5.4A');
    expect(scoped.conditions).toContainEqual({ field: 'plant', op: 'eq', value: 'CHK1' });
    expect(scoped.conditions.find((c) => c.field === 'value')!.value).toBe(600000);
    expect(scoped.route).toBe('SPOT_PO');
  });

  it('understands conversational limit changes by route', () => {
    const r = parseAmendment('raise the spot PO limit to ₹3,00,000', policy);
    expect(r.proposed.decision_rules.find((x) => x.id === '5.4')!.conditions.find((c) => c.field === 'value')!.value).toBe(300000);
    const r2 = parseAmendment('increase the RFQ threshold to 15 lakh', policy);
    expect(r2.proposed.decision_rules.find((x) => x.id === '5.5')!.conditions.find((c) => c.field === 'value')!.value).toBe(1500000);
  });

  it('surfaces sentences it cannot interpret instead of guessing', () => {
    const r = parseAmendment('Buyers must wear safety shoes in the warehouse.', policy);
    expect(r.changes).toHaveLength(0);
    expect(r.unparsed).toHaveLength(1);
  });

  it('produces a plain-language policy summary', () => {
    const lines = plainPolicy(policy);
    expect(lines[0]).toContain('new item');
    expect(lines.join('\n')).toContain('Spot PO');
  });
});
