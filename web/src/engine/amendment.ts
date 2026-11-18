import type { Condition, DecisionRule, PolicyDoc } from './types';

export interface PolicyChange {
  kind: 'limit' | 'window' | 'new_rule' | 'modify_rule' | 'remove_rule';
  target: string;
  before?: string;
  after?: string;
  plain: string;
}

export interface AmendmentResult {
  proposed: PolicyDoc;
  changes: PolicyChange[];
  unparsed: string[];
}

const clone = (p: PolicyDoc): PolicyDoc => JSON.parse(JSON.stringify(p));

/** Parse "5,00,000" | "500000" | "5 lakh" | "1.2 crore" | "5L". */
export function moneyToNumber(s: string): number | null {
  const t = s.toLowerCase().replace(/₹|rs\.?|inr/g, '').replace(/\s+/g, ' ').trim();
  const m = t.match(/([\d,]+(?:\.\d+)?)\s*(lakh|lakhs|lac|crore|cr|l|k)?/);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const unit = m[2] ?? '';
  if (unit.startsWith('lakh') || unit === 'lac' || unit === 'l') n *= 100000;
  else if (unit === 'crore' || unit === 'cr') n *= 10000000;
  else if (unit === 'k') n *= 1000;
  return n;
}

function money(n: number): string {
  return '₹' + n.toLocaleString('en-IN');
}

function ruleById(doc: PolicyDoc, id: string): DecisionRule | undefined {
  return doc.decision_rules.find((r) => r.id.toLowerCase() === id.toLowerCase());
}

function routeOfText(s: string): { route: string; decision: 'PO' | 'SOURCING_REQUEST'; suggest?: number } | null {
  const t = s.toLowerCase();
  const n = t.match(/(\d)\s*suppliers?/);
  if (/capex/.test(t)) return { route: 'CAPEX_SOURCING', decision: 'SOURCING_REQUEST', suggest: n ? Number(n[1]) : 5 };
  if (/emergency/.test(t)) return { route: 'EMERGENCY_PO', decision: 'PO' };
  if (/spot\s*(po|purchase|order)|special order/.test(t)) return { route: 'SPOT_PO', decision: 'PO' };
  if (/contract[_ ]po|rate contract/.test(t)) return { route: 'CONTRACT_PO', decision: 'PO' };
  if (/\brfp\b/.test(t)) return { route: 'RFP', decision: 'SOURCING_REQUEST', suggest: n ? Number(n[1]) : 5 };
  if (/\brfq\b/.test(t)) return { route: 'RFQ', decision: 'SOURCING_REQUEST', suggest: n ? Number(n[1]) : 3 };
  if (/new item|new[_ ]item/.test(t)) return { route: 'NEW_ITEM_SOURCING', decision: 'SOURCING_REQUEST' };
  if (/purchase order|\bpo\b/.test(t)) return { route: 'SPOT_PO', decision: 'PO' };
  return null;
}

function qualifiers(sentence: string): Condition[] {
  const conds: Condition[] = [];
  const plants: string[] = [];
  if (/\bpun1\b|bhosari/i.test(sentence)) plants.push('PUN1');
  if (/\bchk1\b|chakan/i.test(sentence)) plants.push('CHK1');
  if (plants.length === 1) conds.push({ field: 'plant', op: 'eq', value: plants[0] });
  if (plants.length > 1) conds.push({ field: 'plant', op: 'in', value: plants });
  if (/\bcapex\b/i.test(sentence)) conds.push({ field: 'item_type', op: 'eq', value: 'Capex' });
  if (/\bservices?\b/i.test(sentence)) conds.push({ field: 'item_type', op: 'eq', value: 'Service' });
  if (/\bemergenc(y|ies)\b|\burgent\b/i.test(sentence) && !/limit|threshold/i.test(sentence.replace(/emergency/gi, '')))
    conds.push({ field: 'is_emergency', op: 'eq', value: true });
  const cat = sentence.match(/categor(?:y|ies)\s*(?:of|:)?\s*["']?([A-Za-z][A-Za-z &/-]{2,40}?)["']?(?=[,.;]|\s+(?:items?|below|above|up to|at|with|require|may|can|are)\b|$)/i);
  if (cat) conds.push({ field: 'item_category', op: 'eq', value: cat[1].trim() });
  const itemType = sentence.match(/\b(material|service|capex)\s+items?\b/i);
  if (itemType && itemType[1].toLowerCase() === 'service') conds.push({ field: 'item_type', op: 'eq', value: 'Service' });
  return conds;
}

function valueCondition(sentence: string): Condition | null {
  const patterns: Array<{ re: RegExp; op: Condition['op'] }> = [
    { re: /(?:below|under|less than|up to|upto|not exceeding|no more than)\s*[₹rs. inr]*([\d,.]+(?:\s*(?:lakh|lac|crore|cr|l|k))?)/i, op: 'lt' },
    { re: /(?:at or below|at or under|<=|≤)\s*[₹rs. inr]*([\d,.]+(?:\s*(?:lakh|lac|crore|cr|l|k))?)/i, op: 'lte' },
    { re: /(?:above|over|more than|in excess of|at least|from)\s*[₹rs. inr]*([\d,.]+(?:\s*(?:lakh|lac|crore|cr|l|k))?)/i, op: 'gte' },
  ];
  for (const p of patterns) {
    const m = sentence.match(p.re);
    if (m) {
      const v = moneyToNumber(m[1]);
      if (v != null) return { field: 'value', op: p.op, value: v };
    }
  }
  return null;
}

/**
 * Deterministic interpretation of a policy amendment document. The buyer can
 * correct anything in the rule editor before approving; unparsed sentences are
 * surfaced instead of guessed at.
 */
export function parseAmendment(text: string, current: PolicyDoc): AmendmentResult {
  const proposed = clone(current);
  const changes: PolicyChange[] = [];
  const unparsed: string[] = [];

  const sentences = text
    .replace(/\r/g, '')
    .split(/(?<=[.!?;:])\s+(?=[A-Z“"'(])|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3 && /[a-z]/i.test(s));

  for (const sentence of sentences) {
    const isNewRule = /\b(new rule|add (a )?rule|introduce (a )?rule|additional rule)\b/i.test(sentence);
    const ruleIdMatch = sentence.match(/\b(?:rule|clause|section)\s*(\d\.\d[A-Za-z]?)\b/i) ?? sentence.match(/\b(\d\.\d[A-Za-z]?)\b/);
    const ruleId = ruleIdMatch?.[1];

    // 1) Window / lookback changes.
    const win = sentence.match(/\b(\d{1,3})\s*(calendar\s+)?(days?|hours?)\b/i);
    if (win && /(window|club|consolidat|need[- ]by|lookback|history)/i.test(sentence)) {
      const n = Number(win[1]);
      const hours = /hours?/i.test(win[3]);
      if (/consolidat/i.test(sentence)) {
        const before = proposed.po_consolidation.window_hours;
        proposed.po_consolidation.window_hours = n;
        changes.push({ kind: 'window', target: 'PO consolidation (7.1)', before: `${before} hours`, after: `${n} hours`, plain: `Requirements are combined into one PO when raised within ${n} hours of the PO's first requirement (was ${before}).` });
        continue;
      }
      if (/need[- ]by/i.test(sentence)) {
        const before = proposed.clubbing.need_by_window_days;
        proposed.clubbing.need_by_window_days = n;
        changes.push({ kind: 'window', target: 'Clubbing need-by window (2.2)', before: `${before} days`, after: `${n} days`, plain: `Two lines club only if their need-by dates are within ${n} days of the first line's need-by date (was ${before}).` });
        continue;
      }
      if (/(history|lookback)/i.test(sentence)) {
        const before = proposed.preferred_suppliers.history_days;
        proposed.preferred_suppliers.history_days = n;
        changes.push({ kind: 'window', target: 'Preferred supplier history (6.1)', before: `${before} days`, after: `${n} days`, plain: `Preferred supplier lists look back ${n} days of purchase history (was ${before}).` });
        continue;
      }
      if (/(club|creation)/i.test(sentence)) {
        const before = proposed.clubbing.creation_window_days;
        proposed.clubbing.creation_window_days = n;
        changes.push({ kind: 'window', target: 'Clubbing creation window (2.2)', before: `${before} days`, after: `${n} days`, plain: `PR lines club when created within ${n} calendar days of the requirement's first line (was ${before}).` });
        continue;
      }
    }

    // 2) New rule.
    if (isNewRule) {
      const route = routeOfText(sentence);
      if (!route) {
        unparsed.push(sentence);
        continue;
      }
      const conds: Condition[] = [...qualifiers(sentence)];
      const vc = valueCondition(sentence);
      if (vc) conds.push(vc);
      if (/(purchase history|bought|proven supplier)/i.test(sentence) && route.decision === 'PO') conds.push({ field: 'bought_from_active_supplier', op: 'eq', value: true });
      if (route.decision === 'PO' && !conds.some((c) => c.field === 'usable_contract')) {
        // PO rules should not silently pre-empt contracts; keep condition set explicit.
      }
      const baseRule = ruleId
        ? ruleById(proposed, ruleId) ?? ruleById(proposed, ruleId.replace(/[A-Za-z]$/, ''))
        : proposed.decision_rules.find((r) => r.route === route.route);
      const priority = baseRule ? baseRule.priority - 0.5 : Math.max(...proposed.decision_rules.map((r) => r.priority)) + 0.5;
      const id = ruleId ?? `${baseRule?.id ?? '9.0'}${String.fromCharCode(65 + proposed.decision_rules.length % 26)}`;
      const newRule: DecisionRule = {
        id,
        priority,
        conditions: conds,
        outcome: route.decision,
        route: route.route,
        ...(route.suggest ? { suggest_count: route.suggest } : {}),
        note: 'Added by amendment.',
      };
      if (route.decision === 'PO') {
        newRule.supplier = route.route === 'CONTRACT_PO' ? 'contract' : 'first_preferred';
        newRule.price = route.route === 'CONTRACT_PO' ? 'contract_rate' : 'reference_price';
      }
      proposed.decision_rules.push(newRule);
      changes.push({ kind: 'new_rule', target: `Rule ${id}`, plain: plainRule(newRule) });
      continue;
    }

    // 3) Limit change on an existing rule (by id or by route keyword).
    const amounts = [...sentence.matchAll(/(?:₹|rs\.?\s*|inr\s*)([\d,]+(?:\.\d+)?(?:\s*(?:lakh|lakhs|lac|crore|cr))?)/gi)].map((m) => moneyToNumber(m[1])).filter((n): n is number => n != null);
    const looseAmounts = [...sentence.matchAll(/([\d,]+(?:\.\d+)?\s*(?:lakh|lakhs|lac|crore|cr))\b/gi)].map((m) => moneyToNumber(m[1])).filter((n): n is number => n != null);
    // Fallback for documents where the currency glyph is lost (PDF copy, chat, etc.):
    // Indian comma groups (2,00,000) or bare 5+ digit numbers, excluding durations.
    const bareAmounts = [...sentence.matchAll(/\b(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d{5,}(?:\.\d+)?)\b(?!\s*(?:days?|hours?|months?|years?))/gi)]
      .map((m) => moneyToNumber(m[1]))
      .filter((n): n is number => n != null && n >= 1000);
    const allAmounts = amounts.length ? amounts : looseAmounts.length ? looseAmounts : bareAmounts;
    const replaceWith = sentence.match(/replace\s+[^.]*?\bwith\s+[^\d]*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?(?:\s*(?:lakh|lakhs|lac|crore|cr))?)/i);
    if (replaceWith) {
      const target = moneyToNumber(replaceWith[1]);
      if (target != null) allAmounts.push(target);
    }
    const route = routeOfText(sentence);
    const rule = ruleId ? ruleById(proposed, ruleId) : route ? proposed.decision_rules.find((r) => r.route === route.route) : undefined;

    if (rule && allAmounts.length > 0) {
      const valueConds = rule.conditions.filter((c) => c.field === 'value');
      if (valueConds.length > 0) {
        const old = Number(valueConds[0].value);
        const next = allAmounts[allAmounts.length - 1];
        for (const c of valueConds) c.value = next;
        changes.push({ kind: 'limit', target: `Rule ${rule.id}`, before: money(old), after: money(next), plain: `Rule ${rule.id} (${rule.route}) limit changes from ${money(old)} to ${money(next)}.` });
        continue;
      }
      // Rule without a value condition: add one if the sentence implies a threshold.
      const vc = valueCondition(sentence);
      if (vc) {
        rule.conditions.push(vc);
        changes.push({ kind: 'modify_rule', target: `Rule ${rule.id}`, after: money(Number(vc.value)), plain: `Rule ${rule.id} (${rule.route}) now applies when value ${vc.op} ${money(Number(vc.value))}.` });
        continue;
      }
    }

    // 4) Qualifier onto an existing rule becomes a plant/category-scoped new rule (safer than widening).
    if (rule && !allAmounts.length) {
      const conds = qualifiers(sentence);
      if (conds.length > 0) {
        const newRule: DecisionRule = {
          ...JSON.parse(JSON.stringify(rule)),
          id: `${rule.id}${String.fromCharCode(65 + proposed.decision_rules.length % 26)}`,
          priority: rule.priority - 0.5,
          conditions: [...conds, ...rule.conditions.filter((c) => !conds.some((q) => q.field === c.field))],
          note: 'Added by amendment.',
        };
        proposed.decision_rules.push(newRule);
        changes.push({ kind: 'new_rule', target: `Rule ${newRule.id}`, plain: plainRule(newRule) + ` (scoped copy of rule ${rule.id})` });
        continue;
      }
    }

    unparsed.push(sentence);
  }

  return { proposed, changes, unparsed };
}

const ROUTE_NAMES: Record<string, string> = {
  CONTRACT_PO: 'Contract PO',
  EMERGENCY_PO: 'Emergency PO',
  SPOT_PO: 'Spot PO',
  RFQ: 'RFQ',
  RFP: 'RFP',
  CAPEX_SOURCING: 'Capex sourcing',
  NEW_ITEM_SOURCING: 'New-item sourcing',
};

export function plainRule(r: DecisionRule): string {
  const when = r.conditions.length === 0 ? 'always' : r.conditions.map(plainCondition).join(' and ');
  const name = ROUTE_NAMES[r.route] ?? r.route.replace(/_/g, ' ').toLowerCase();
  const outcome = r.outcome === 'PO'
    ? `place a ${name}${r.supplier === 'contract' ? ' with the contract supplier at the contract rate' : ' with the 1st preferred supplier at its reference price'}`
    : `raise ${/^[AER]/.test(name) ? 'an' : 'a'} ${name} request${r.suggest_count ? ` with ${r.suggest_count} suggested suppliers` : ''}`;
  return `Rule ${r.id}: when ${when}, ${outcome}.`;
}

export function plainCondition(c: Condition): string {
  const value = c.field === 'value' ? money(Number(c.value)) : Array.isArray(c.value) ? c.value.join(' or ') : String(c.value);
  const labels: Record<string, string> = {
    item_type: 'item type', item_category: 'category', plant: 'plant', value: 'value', is_emergency: 'emergency',
    usable_contract: 'a usable contract exists', bought_from_active_supplier: 'bought from an Active supplier in the window',
    item_code: 'item', uom: 'uom', is_new_item: 'a new item',
  };
  const ops: Record<string, string> = { eq: '=', neq: '≠', lt: '<', lte: '≤', gt: '>', gte: '≥', in: 'in' };
  if (c.field === 'usable_contract' || c.field === 'is_new_item') return `${labels[c.field]} is ${c.value}`;
  if (c.field === 'is_emergency') return c.value ? 'the requirement is an emergency' : 'the requirement is not an emergency';
  if (c.field === 'bought_from_active_supplier') return c.value ? 'bought from an Active supplier within the history window' : 'no Active supplier purchase in the window';
  return `${labels[c.field]} ${ops[c.op]} ${value}`;
}

export function plainPolicy(doc: PolicyDoc): string[] {
  return [...doc.decision_rules]
    .sort((a, b) => a.priority - b.priority)
    .map(plainRule);
}
