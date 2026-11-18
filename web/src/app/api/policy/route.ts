import { ensureSchema, q } from '@/db';
import { audit, bad, ok, actorFrom } from '@/lib/api';
import { policyForDate } from '@/engine/policy';
import type { PolicyDoc } from '@/engine/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  await ensureSchema();
  const url = new URL(req.url);
  if (url.searchParams.get('format') === 'doc') {
    const rows = await q<{ doc: PolicyDoc }>(
      `SELECT doc FROM policy_versions WHERE status='active' ORDER BY effective_date ASC`,
    );
    if (!rows.length) return bad('no active policy', 404);
    const today = new Date().toISOString().slice(0, 10);
    return ok({ doc: policyForDate(rows.map((r) => r.doc), today) });
  }
  const versions = await q(
    `SELECT id, version, effective_date, status, source_note, changes, created_at, created_by, approved_at, approved_by,
            (SELECT count(*)::int FROM policy_versions p2 WHERE p2.effective_date <= pv.effective_date AND p2.status='active') AS seq
     FROM policy_versions pv ORDER BY effective_date DESC, id DESC`,
  );
  const [active] = await q<{ doc: PolicyDoc }>(`SELECT doc FROM policy_versions WHERE status='active' ORDER BY effective_date DESC LIMIT 1`);
  return ok({ versions, active_doc: active?.doc ?? null });
}

export async function POST(req: Request) {
  await ensureSchema();
  const actor = actorFrom(req);
  const body = await req.json().catch(() => null);
  if (!body) return bad('JSON body required');
  const { version, effective_date, doc, source_note, changes } = body as {
    version?: string; effective_date?: string; doc?: PolicyDoc; source_note?: string; changes?: unknown;
  };
  if (!version || !/^[0-9][A-Za-z0-9.]{0,19}$/.test(version)) return bad('version like "5.1" is required');
  if (!effective_date || !/^\d{4}-\d{2}-\d{2}$/.test(effective_date)) return bad('effective_date (YYYY-MM-DD) is required');
  if (!doc || !Array.isArray(doc.decision_rules) || doc.decision_rules.length === 0) return bad('policy doc with decision_rules is required');
  for (const r of doc.decision_rules) {
    if (!r.id || !Number.isFinite(Number(r.priority)) || !r.outcome || !r.route) return bad(`rule ${r.id ?? '?'} is incomplete`);
    if (!Array.isArray(r.conditions)) return bad(`rule ${r.id} conditions must be an array`);
  }
  const exists = await q(`SELECT id FROM policy_versions WHERE version=$1`, [version]);
  if (exists.length) return bad('version already exists', 409);

  // Stamp the document with its version + effective date so decisions record the
  // version actually applied.
  const stamped: PolicyDoc = { ...doc, version, effective_date };

  const [row] = await q<{ id: number }>(
    `INSERT INTO policy_versions (version, effective_date, status, doc, source_note, changes, created_by, approved_at, approved_by)
     VALUES ($1,$2,'active',$3,$4,$5,$6,now(),$7) RETURNING id`,
    [version, effective_date, JSON.stringify(stamped), source_note ?? null, changes ? JSON.stringify(changes) : null, actor.name, actor.name],
  );
  await audit(actor, 'policy.activate', 'policy_version', row.id, { version, effective_date, source_note });
  return ok({ id: row.id, version, effective_date });
}
