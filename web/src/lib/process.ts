import { q } from '@/db';
import { runEngine } from '@/engine/run';
import { toCsv } from '@/engine/export';
import type { ExportRow } from '@/engine/types';
import { dbLineToEngine, loadEngineBase, loadPolicies, type DbLine } from './data';
import { audit, type Actor } from './api';

export interface ProcessResult {
  runId: number;
  requirementCount: number;
  rowCount: number;
  pos: number;
  warnings: string[];
  policyVersions: string[];
  stats: Record<string, number>;
}

export async function processBatch(
  batchId: number,
  actor: Actor,
  policyMode: 'requirement_date' | 'latest' = 'requirement_date',
): Promise<ProcessResult> {
  const lines = await q<DbLine & { id: number; sort_order: number }>(
    `SELECT id, pr_no, pr_line, created_at, requester, department, plant, item_code, description,
            quantity, uom, estimated_unit_price, need_by_date, urgency, sort_order
     FROM pr_lines WHERE batch_id = $1 ORDER BY sort_order, pr_no, pr_line`,
    [batchId],
  );
  if (lines.length === 0) throw new Error('batch has no PR lines');

  const base = await loadEngineBase();
  const policies = await loadPolicies();
  if (policies.length === 0) throw new Error('no active policy version');

  const result = runEngine({ ...base, prLines: lines.map(dbLineToEngine), policies, policyMode });

  const stats: Record<string, number> = {};
  for (const r of result.rows) stats[r.route] = (stats[r.route] ?? 0) + 1;

  const [run] = await q<{ id: number }>(
    `INSERT INTO runs (batch_id, created_by, policy_versions, stats) VALUES ($1,$2,$3,$4) RETURNING id`,
    [batchId, actor.name, result.policyVersionsUsed.join(','), JSON.stringify(stats)],
  );

  const lineId = new Map<string, number>();
  for (const l of lines) lineId.set(`${l.pr_no}/${l.pr_line}`, l.id);

  for (const req of result.requirements) {
    const [row] = await q<{ id: number }>(
      `INSERT INTO requirements
        (run_id, group_id, item_code, item_description, plant, first_line_at, need_by_date, is_emergency,
         total_qty, unit_price, value, decision, route, rule_id, supplier_id, po_id, suggested_supplier_ids,
         policy_version, reason, contract_id, ref_po_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING id`,
      [
        run.id, req.group_id, req.item_code, req.item_description, req.plant, req.first_line_at, req.need_by_date, req.is_emergency,
        req.total_qty, req.unit_price, req.value, req.decision, req.route, req.rule_id, req.supplier_id, req.po_id,
        req.suggested_supplier_ids.join(';'), req.policy_version, req.reason, req.contract_id, req.ref_po_number,
      ],
    );
    for (const l of req.lines) {
      const id = lineId.get(`${l.pr_no}/${l.pr_line}`);
      if (id) {
        await q(`INSERT INTO requirement_lines (requirement_id, pr_line_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [row.id, id]);
      }
    }
  }

  for (const po of result.pos) {
    await q(
      `INSERT INTO purchase_orders (run_id, po_id, supplier_id, plant, route, total_value, first_req_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [run.id, po.po_id, po.supplier_id, po.plant, po.route, po.total_value, po.first_req_at],
    );
  }

  for (const req of result.requirements) {
    if (req.decision === 'SOURCING_REQUEST') {
      const [r] = await q<{ id: number }>(`SELECT id FROM requirements WHERE run_id=$1 AND group_id=$2`, [run.id, req.group_id]);
      if (r) {
        await q(
          `INSERT INTO sourcing_events (run_id, requirement_id, type, supplier_ids) VALUES ($1,$2,$3,$4)`,
          [run.id, r.id, req.route, req.suggested_supplier_ids.join(';')],
        );
      }
    }
  }

  for (const row of result.rows) {
    const id = lineId.get(`${row.pr_no}/${row.pr_line}`) ?? null;
    const line = lines.find((l) => l.pr_no === row.pr_no && l.pr_line === row.pr_line);
    await q(
      `INSERT INTO run_rows
        (run_id, pr_line_id, sort_order, pr_no, pr_line, resolved_item_code, group_id, po_id, decision, route,
         supplier_id, unit_price, group_value_inr, suggested_supplier_ids, policy_version, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        run.id, id, line?.sort_order ?? 0, row.pr_no, row.pr_line, row.resolved_item_code, row.group_id, row.po_id,
        row.decision || null, row.route, row.supplier_id || null, row.unit_price === '' ? null : Number(row.unit_price),
        row.group_value_inr === '' ? null : Number(row.group_value_inr), row.suggested_supplier_ids, row.policy_version || null,
        row.reason,
      ],
    );
    if (id && row.resolved_item_code) {
      await q(`UPDATE pr_lines SET resolved_item_code=$1 WHERE id=$2`, [row.resolved_item_code, id]);
    }
  }

  await audit(actor, 'run.process', 'run', run.id, { batchId, stats, policyVersions: result.policyVersionsUsed });

  return {
    runId: run.id,
    requirementCount: result.requirements.length,
    rowCount: result.rows.length,
    pos: result.pos.length,
    warnings: result.warnings,
    policyVersions: result.policyVersionsUsed,
    stats,
  };
}

export async function runCsv(runId: number): Promise<string> {
  const rows = await q<any>(
    `SELECT pr_no, pr_line, resolved_item_code, group_id, po_id, decision, route, supplier_id, unit_price,
            group_value_inr, suggested_supplier_ids, policy_version, reason
     FROM run_rows WHERE run_id=$1 ORDER BY sort_order, pr_no, pr_line`,
    [runId],
  );
  const exportRows: ExportRow[] = rows.map((r) => ({
    pr_no: r.pr_no,
    pr_line: r.pr_line,
    resolved_item_code: r.resolved_item_code ?? '',
    group_id: r.group_id ?? '',
    po_id: r.po_id ?? '',
    decision: r.decision ?? '',
    route: r.route ?? '',
    supplier_id: r.supplier_id ?? '',
    unit_price: r.unit_price == null ? '' : Number(r.unit_price).toFixed(2),
    group_value_inr: r.group_value_inr == null ? '' : Number(r.group_value_inr).toFixed(2),
    suggested_supplier_ids: r.suggested_supplier_ids ?? '',
    policy_version: r.policy_version ?? '',
    reason: r.reason ?? '',
  }));
  return toCsv(exportRows);
}
