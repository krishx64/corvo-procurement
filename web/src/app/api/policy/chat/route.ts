import { bad, ok, actorFrom, audit } from '@/lib/api';
import { parseAmendment } from '@/engine/amendment';
import { policyForDate } from '@/engine/policy';
import { loadPolicies } from '@/lib/data';
import type { PolicyDoc } from '@/engine/types';
import { ensureSchema } from '@/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isPolicyDoc(v: unknown): v is PolicyDoc {
  return !!v && typeof v === 'object' && Array.isArray((v as PolicyDoc).decision_rules) && (v as PolicyDoc).decision_rules.length > 0;
}

/**
 * Chat-style policy change: the Procurement user describes a change in plain
 * language; the app proposes policy edits for review. Nothing activates here —
 * activation stays behind the explicit approve step.
 */
export async function POST(req: Request) {
  await ensureSchema();
  const actor = actorFrom(req);
  const body = await req.json().catch(() => null);
  if (!body) return bad('JSON body required');
  const message = String(body.message ?? '').trim();
  if (!message) return bad('message is required');

  const policies = await loadPolicies();
  if (!policies.length) return bad('no active policy to change', 500);
  const current = isPolicyDoc(body.base) ? body.base : policyForDate(policies, new Date().toISOString().slice(0, 10));

  const result = parseAmendment(message, current);

  let reply: string;
  if (result.changes.length === 0) {
    reply =
      'I could not map that to a rule change. Name the rule or the route and the new limit — for example: “raise the spot PO limit to 3,00,000”, “for CHK1 allow spot purchases up to 6 lakh”, or “make the clubbing window 21 days”.';
  } else {
    reply =
      'Understood. ' +
      result.changes.map((c) => c.plain).join(' ') +
      ' I have put the proposed clauses in the review panel — check them and activate the version when you are ready.';
  }

  await audit(actor, 'policy.chat', 'policy', current.version, { message, changes: result.changes.length });
  return ok({
    reply,
    proposed: result.changes.length ? result.proposed : null,
    changes: result.changes,
    unparsed: result.unparsed,
    base_version: current.version,
  });
}
