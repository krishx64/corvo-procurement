import { hoursDiff } from './dates';
import type { PolicyDoc, PoHeader } from './types';

export interface PoCandidate {
  id: string;
  first_line_at: string;
  supplier_id: string;
  plant: string;
  route: string;
  value: number;
}

/**
 * Policy 7: combine PO-bound requirements with the same supplier/plant/route
 * when raised within N hours of the PO's first requirement. Earliest open PO wins.
 */
export function assignPos(
  reqs: PoCandidate[],
  policy: PolicyDoc,
): { poByReq: Map<string, string>; pos: PoHeader[] } {
  const cfg = policy.po_consolidation;
  const sorted = [...reqs].sort((a, b) => (a.first_line_at < b.first_line_at ? -1 : a.first_line_at > b.first_line_at ? 1 : a.id.localeCompare(b.id)));
  const pos: PoHeader[] = [];
  const poByReq = new Map<string, string>();

  for (const req of sorted) {
    let joined: PoHeader | undefined;
    for (const po of pos) {
      if (cfg.same_supplier && po.supplier_id !== req.supplier_id) continue;
      if (cfg.same_plant && po.plant !== req.plant) continue;
      if (cfg.same_route && po.route !== req.route) continue;
      const h = hoursDiff(po.first_req_at, req.first_line_at);
      if (h >= 0 && h <= cfg.window_hours) {
        joined = po;
        break;
      }
    }
    if (!joined) {
      joined = {
        po_id: `PO-${String(pos.length + 1).padStart(4, '0')}`,
        supplier_id: req.supplier_id,
        plant: req.plant,
        route: req.route,
        requirement_ids: [],
        total_value: 0,
        first_req_at: req.first_line_at,
      };
      pos.push(joined);
    }
    joined.requirement_ids.push(req.id);
    joined.total_value = Math.round((joined.total_value + req.value) * 100) / 100;
    poByReq.set(req.id, joined.po_id);
  }
  return { poByReq, pos };
}
