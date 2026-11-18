import { bad, ok, actorFrom, csvResponse } from '@/lib/api';
import { createBatchFromCsv } from '@/lib/batches';
import { processBatch, runCsv } from '@/lib/process';
import { ensureSchema, q } from '@/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/process-batch
 * Body: multipart form with "file" (CSV), or raw CSV text.
 * Query: ?format=csv returns the decisions CSV.
 */
export async function POST(req: Request) {
  try {
    await ensureSchema();
    const actor = actorFrom(req);
    const ct = req.headers.get('content-type') ?? '';
    let text = '';
    let name = 'API batch';
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (file instanceof File) {
        text = await file.text();
        name = file.name || name;
      } else {
        text = String(form.get('csv') ?? '');
      }
    } else {
      text = await req.text();
    }
    if (!text.trim()) return bad('CSV body required (multipart "file" or raw text)');

    const batch = await createBatchFromCsv(text, name, actor);
    if (batch.errors.length) return bad(batch.errors.join('; '));
    const mode = new URL(req.url).searchParams.get('policy') === 'latest' ? 'latest' : 'requirement_date';
    const result = await processBatch(batch.batchId, actor, mode);

    if (new URL(req.url).searchParams.get('format') === 'csv') {
      return csvResponse(await runCsv(result.runId), `decisions-run-${result.runId}.csv`);
    }
    const rows = await q(
      `SELECT pr_no, pr_line, resolved_item_code, group_id, po_id, decision, route, supplier_id, unit_price,
              group_value_inr, suggested_supplier_ids, policy_version, reason
       FROM run_rows WHERE run_id=$1 ORDER BY sort_order, pr_no, pr_line`,
      [result.runId],
    );
    return ok({ ...result, batchId: batch.batchId, rows });
  } catch (e) {
    return bad(e instanceof Error ? e.message : 'process-batch failed', 500);
  }
}
