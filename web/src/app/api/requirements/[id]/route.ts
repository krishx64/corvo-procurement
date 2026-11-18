import { ensureSchema, q } from '@/db';
import { audit, bad, ok, actorFrom } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const { id } = await ctx.params;
  const [req] = await q(
    `SELECT r.*, (SELECT json_agg(json_build_object(
        'pr_no', l.pr_no, 'pr_line', l.pr_line, 'description', l.description, 'quantity', l.quantity,
        'uom', l.uom, 'plant', l.plant, 'need_by_date', l.need_by_date, 'urgency', l.urgency,
        'created_at', l.created_at, 'requester', l.requester, 'department', l.department,
        'estimated_unit_price', l.estimated_unit_price) ORDER BY l.pr_no, l.pr_line)
      FROM requirement_lines rl JOIN pr_lines l ON l.id = rl.pr_line_id WHERE rl.requirement_id = r.id) AS lines
     FROM requirements r WHERE r.id=$1`,
    [Number(id)],
  );
  if (!req) return bad('requirement not found', 404);
  const po = req.po_id ? (await q(`SELECT * FROM purchase_orders WHERE run_id=$1 AND po_id=$2`, [req.run_id, req.po_id]))[0] : null;
  return ok({ requirement: req, po });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // approve
  await ensureSchema();
  const { id } = await ctx.params;
  const actor = actorFrom(req);
  const [r] = await q<{ id: number; run_id: number; po_id: string | null; decision: string; route: string; status: string }>(
    `SELECT id, run_id, po_id, decision, route, status FROM requirements WHERE id=$1`,
    [Number(id)],
  );
  if (!r) return bad('requirement not found', 404);
  if (r.status !== 'PENDING') return bad(`requirement already ${r.status.toLowerCase()}`, 409);

  await q(`UPDATE requirements SET status='APPROVED', approved_at=now(), approved_by=$1 WHERE id=$2`, [actor.name, r.id]);
  if (r.decision === 'PO' && r.po_id) {
    await q(`UPDATE purchase_orders SET status='APPROVED', approved_at=now(), approved_by=$1 WHERE run_id=$2 AND po_id=$3`, [actor.name, r.run_id, r.po_id]);
  } else {
    await q(`UPDATE sourcing_events SET status='APPROVED', approved_at=now(), approved_by=$1 WHERE requirement_id=$2`, [actor.name, r.id]);
  }
  await audit(actor, 'requirement.approve', 'requirement', r.id, { route: r.route });
  return ok({ approved: true });
}
