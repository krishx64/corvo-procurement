import { ensureSchema, q } from '@/db';
import { bad, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const { id } = await ctx.params;
  const runId = Number(id);
  if (!Number.isFinite(runId)) return bad('invalid run id');

  const [run] = await q(
    `SELECT r.*, b.name AS batch_name FROM runs r JOIN batches b ON b.id = r.batch_id WHERE r.id = $1`,
    [runId],
  );
  if (!run) return bad('run not found', 404);

  const requirements = await q(
    `SELECT q.*,
            (SELECT json_agg(json_build_object(
                 'pr_no', l.pr_no, 'pr_line', l.pr_line, 'description', l.description, 'quantity', l.quantity,
                 'uom', l.uom, 'plant', l.plant, 'need_by_date', l.need_by_date, 'urgency', l.urgency,
                 'created_at', l.created_at, 'requester', l.requester, 'department', l.department,
                 'estimated_unit_price', l.estimated_unit_price
               ) ORDER BY l.pr_no, l.pr_line)
             FROM requirement_lines rl JOIN pr_lines l ON l.id = rl.pr_line_id
             WHERE rl.requirement_id = q.id) AS lines
     FROM requirements q WHERE q.run_id = $1 ORDER BY q.first_line_at, q.group_id`,
    [runId],
  );

  const pos = await q(`SELECT * FROM purchase_orders WHERE run_id=$1 ORDER BY po_id`, [runId]);
  const rows = await q(
    `SELECT pr_no, pr_line, resolved_item_code, group_id, po_id, decision, route, supplier_id, unit_price,
            group_value_inr, suggested_supplier_ids, policy_version, reason
     FROM run_rows WHERE run_id=$1 ORDER BY sort_order, pr_no, pr_line`,
    [runId],
  );
  return ok({ run, requirements, pos, rows });
}
