import { ensureSchema, q } from '@/db';
import { ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureSchema();
  const runs = await q(
    `SELECT r.id, r.batch_id, b.name AS batch_name, r.created_at, r.created_by, r.policy_versions, r.stats,
            (SELECT count(*)::int FROM requirements q WHERE q.run_id = r.id) AS requirement_count,
            (SELECT count(*)::int FROM purchase_orders p WHERE p.run_id = r.id) AS po_count
     FROM runs r JOIN batches b ON b.id = r.batch_id
     ORDER BY r.id DESC LIMIT 100`,
  );
  return ok({ runs });
}
