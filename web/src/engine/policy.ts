import type { Condition, ConditionOp, PolicyDoc, RuleContext } from './types';
import defaultPolicy from './policy-v5.json';

export function loadDefaultPolicy(): PolicyDoc {
  return JSON.parse(JSON.stringify(defaultPolicy)) as PolicyDoc;
}

/** Select the policy version in force on a given date ('YYYY-MM-DD'). */
export function policyForDate(policies: PolicyDoc[], date: string): PolicyDoc {
  const day = date.slice(0, 10);
  const applicable = policies
    .filter((p) => p.effective_date.slice(0, 10) <= day)
    .sort((a, b) => (a.effective_date < b.effective_date ? -1 : a.effective_date > b.effective_date ? 1 : 0));
  if (applicable.length === 0) {
    // Nothing effective yet: use the earliest version (graceful, recorded by caller).
    return [...policies].sort((a, b) => (a.effective_date < b.effective_date ? -1 : 1))[0];
  }
  return applicable[applicable.length - 1];
}

function compare(op: ConditionOp, actual: unknown, expected: unknown): boolean {
  switch (op) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'lt':
      return Number(actual) < Number(expected);
    case 'lte':
      return Number(actual) <= Number(expected);
    case 'gt':
      return Number(actual) > Number(expected);
    case 'gte':
      return Number(actual) >= Number(expected);
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    default:
      return false;
  }
}

export function conditionsMatch(conditions: Condition[], ctx: RuleContext): boolean {
  return conditions.every((c) => {
    const actual = (ctx as unknown as Record<string, unknown>)[c.field];
    return compare(c.op, actual, c.value);
  });
}

/** Sorted by priority ascending (version order = policy order). */
export function orderedRules(policy: PolicyDoc) {
  return [...policy.decision_rules].sort((a, b) => a.priority - b.priority);
}
