import { ensureSchema, q } from '@/db';
import { audit, bad, ok, actorFrom } from '@/lib/api';
import { processBatch } from '@/lib/process';
import type { ChatDraft } from '@/lib/chatNlu';

export const dynamic = 'force-dynamic';

function istNow(): { stamp: string; day: string } {
  const s = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' });
  return { stamp: s.slice(0, 16), day: s.slice(0, 10) };
}

export async function POST(req: Request) {
  try {
    await ensureSchema();
    const actor = actorFrom(req);
    const body = await req.json().catch(() => null);
    if (!body?.draft) return bad('draft is required');
    const d = body.draft as ChatDraft;

    if (!d.quantity || d.quantity <= 0) return bad('quantity is required');
    if (!d.plant) return bad('plant is required');
    if (!d.need_by_date) return bad('need-by date is required');
    if (!d.item_code && !d.item_description) return bad('item is required');
    if (d.is_new_item && (d.estimated_unit_price == null || d.estimated_unit_price <= 0)) return bad('estimated unit price is required for a new item');

    const now = istNow();
    const [maxRow] = await q<{ max: string | null }>(`SELECT max(pr_no) AS max FROM pr_lines WHERE pr_no LIKE 'PR-26-%'`);
    const maxNo = maxRow?.max ? Number(maxRow.max.replace('PR-26-', '')) : 0;
    const prNo = `PR-26-${String(maxNo + 1).padStart(5, '0')}`;

    const [batch] = await q<{ id: number }>(
      `INSERT INTO batches (name, source, created_by) VALUES ($1,'chat',$2) RETURNING id`,
      [`Chat intake ${now.stamp}`, actor.name],
    );
    await q(
      `INSERT INTO pr_lines
        (batch_id, pr_no, pr_line, created_at, requester, department, plant, item_code, description, quantity, uom,
         estimated_unit_price, need_by_date, urgency, sort_order, source)
       VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,0,'chat')`,
      [
        batch.id, prNo, now.stamp, actor.name, 'Requester', d.plant, d.item_code ?? null,
        d.item_description ?? d.item_query ?? 'New item', Number(d.quantity), d.uom ?? null,
        d.estimated_unit_price ?? null, d.need_by_date, d.urgency ?? 'Normal',
      ],
    );
    await audit(actor, 'pr.create.chat', 'pr_line', prNo, { draft: d });

    const result = await processBatch(batch.id, actor);
    const [row] = await q<any>(
      `SELECT pr_no, pr_line, resolved_item_code, group_id, po_id, decision, route, supplier_id, unit_price,
              group_value_inr, suggested_supplier_ids, policy_version, reason
       FROM run_rows WHERE run_id=$1 AND pr_no=$2 ORDER BY pr_line`,
      [result.runId, prNo],
    );
    return ok({ pr_no: prNo, run_id: result.runId, decision: row });
  } catch (e) {
    return bad(e instanceof Error ? e.message : 'could not create the PR', 500);
  }
}
