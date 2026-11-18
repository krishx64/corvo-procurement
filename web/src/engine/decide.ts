import { conditionsMatch, orderedRules } from './policy';
import type { DecisionRule, PolicyDoc, RuleContext } from './types';

export interface Decision {
  rule: DecisionRule;
  decision: 'PO' | 'SOURCING_REQUEST';
  route: string;
  suggest_count: number;
}

/** Policy 5: apply rules in order; first rule whose conditions all fit decides. */
export function decideRequirement(ctx: RuleContext, policy: PolicyDoc): Decision | undefined {
  for (const rule of orderedRules(policy)) {
    if (conditionsMatch(rule.conditions, ctx)) {
      return { rule, decision: rule.outcome, route: rule.route, suggest_count: rule.suggest_count ?? 0 };
    }
  }
  return undefined;
}
