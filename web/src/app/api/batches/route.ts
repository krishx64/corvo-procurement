import { bad, ok } from '@/lib/api';
import { createBatchFromCsv } from '@/lib/batches';
import { actorFrom } from '@/lib/api';
import { ensureSchema, q } from '@/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureSchema();
  const rows = await q(
    `SELECT b.id, b.name, b.source, b.created_at, b.created_by, count(l.id)::int AS line_count,
            (SELECT max(r.id) FROM runs r WHERE r.batch_id = b.id) AS last_run_id
     FROM batches b LEFT JOIN pr_lines l ON l.batch_id = b.id
     GROUP BY b.id ORDER BY b.id DESC LIMIT 100`,
  );
  return ok({ batches: rows });
}

export async function POST(req: Request) {
  try {
    await ensureSchema();
    const actor = actorFrom(req);
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return bad('multipart field "file" (CSV) is required');
    const text = await file.text();
    const result = await createBatchFromCsv(text, file.name || 'PR batch', actor);
    if (result.errors.length) return bad(result.errors.join('; '));
    return ok(result);
  } catch (e) {
    return bad(e instanceof Error ? e.message : 'upload failed', 500);
  }
}
