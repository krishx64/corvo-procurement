import { ensureSchema, q } from '@/db';
import { ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  await ensureSchema();
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || 200), 500);
  const rows = await q(
    `SELECT id, at, actor, role, action, entity, entity_id, details FROM audit_log ORDER BY id DESC LIMIT $1`,
    [limit],
  );
  return ok({ audit: rows });
}
