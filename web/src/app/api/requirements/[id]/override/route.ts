import { ensureSchema, q } from '@/db';
import { audit, bad, ok, actorFrom } from '@/lib/api';

export const dynamic = 'force-dynamic';

const ROUTES = ['CONTRACT_PO', 'EMERGENCY_PO', 'SPOT_PO', 'RFQ', 'RFP', 'CAPEX_SOURCING', 'NEW_ITEM_SOURCING', 'NOT_PROCESSED'];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const { id } = await ctx.params;
  const actor = actorFrom(req);
  const body = await req.json().catch(() => null);
  if (!body) return bad('JSON body required');
  const { route, supplier_id, comment } = body as { route?: string; supplier_id?: string; comment?: string };
  if (!comment || !comment.trim()) return bad('a written comment is required to override a decision');
  if (route && !ROUTES.includes(route)) return bad(`route must be one of ${ROUTES.join(', ')}`);
  const isPoRoute = route ? ['CONTRACT_PO', 'EMERGENCY_PO', 'SPOT_PO'].includes(route) : false;
  if (isPoRoute && !supplier_id) return bad('supplier_id is required when overriding to a PO route');

  const [r] = await q<{ id: number; route: string; status: string; supplier_id: string | null }>(
    `SELECT id, route, status, supplier_id FROM requirements WHERE id=$1`,
    [Number(id)],
  );
  if (!r) return bad('requirement not found', 404);
  if (r.status !== 'PENDING') return bad(`requirement already ${r.status.toLowerCase()}`, 409);

  await q(
    `UPDATE requirements SET status='OVERRIDDEN', override_route=$1, override_supplier_id=$2, override_reason=$3,
            override_at=now(), override_by=$4 WHERE id=$5`,
    [route ?? null, supplier_id ?? null, comment.trim(), actor.name, r.id],
  );
  await audit(actor, 'requirement.override', 'requirement', r.id, {
    from: { route: r.route, supplier_id: r.supplier_id },
    to: { route: route ?? r.route, supplier_id: supplier_id ?? r.supplier_id },
    comment: comment.trim(),
  });
  return ok({ overridden: true });
}
