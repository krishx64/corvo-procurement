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

/**
 * Processes a batch and persists everything with a handful of bulk statements.
 * (Row-by-row inserts over a pooled Neon connection blow through serverless
 * timeouts on ~200-line batches.)
 */
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
  const lineSort = new Map<string, number>();
  for (const l of lines) {
    lineId.set(`${l.pr_no}/${l.pr_line}`, l.id);
    lineSort.set(`${l.pr_no}/${l.pr_line}`, l.sort_order);
  }

  // --- requirements (one statement) ---
  const reqs = result.requirements;
  const inserted = reqs.length
    ? await q<{ id: number; group_id: string }>(
        `INSERT INTO requirements
           (run_id, group_id, item_code, item_description, plant, first_line_at, need_by_date, is_emergency,
            total_qty, unit_price, value, decision, route, rule_id, supplier_id, po_id, suggested_supplier_ids,
            policy_version, reason, contract_id, ref_po_number)
         SELECT $1, * FROM UNNEST(
           $2::text[], $3::text[], $4::text[], $5::text[], $6::timestamp[], $7::date[], $8::boolean[],
           $9::numeric[], $10::numeric[], $11::numeric[], $12::text[], $13::text[], $14::text[], $15::text[],
           $16::text[], $17::text[], $18::text[], $19::text[], $20::text[], $21::text[]
         )
         RETURNING id, group_id`,
        [
          run.id,
          reqs.map((r) => r.group_id),
          reqs.map((r) => r.item_code),
          reqs.map((r) => r.item_description ?? null),
          reqs.map((r) => r.plant),
          reqs.map((r) => r.first_line_at),
          reqs.map((r) => r.need_by_date),
          reqs.map((r) => r.is_emergency),
          reqs.map((r) => r.total_qty),
          reqs.map((r) => r.unit_price),
          reqs.map((r) => r.value),
          reqs.map((r) => r.decision),
          reqs.map((r) => r.route),
          reqs.map((r) => r.rule_id),
          reqs.map((r) => r.supplier_id),
          reqs.map((r) => r.po_id),
          reqs.map((r) => r.suggested_supplier_ids.join(';')),
          reqs.map((r) => r.policy_version),
          reqs.map((r) => r.reason),
          reqs.map((r) => r.contract_id),
          reqs.map((r) => r.ref_po_number),
        ],
      )
    : [];
  const idByGroup = new Map(inserted.map((r) => [r.group_id, r.id]));

  // --- requirement <-> line links (one statement) ---
  const reqIds: number[] = [];
  const prLineIds: number[] = [];
  for (const req of reqs) {
    const rid = idByGroup.get(req.group_id);
    if (!rid) continue;
    for (const l of req.lines) {
      const lid = lineId.get(`${l.pr_no}/${l.pr_line}`);
      if (lid) {
        reqIds.push(rid);
        prLineIds.push(lid);
      }
    }
  }
  if (reqIds.length) {
    await q(`INSERT INTO requirement_lines (requirement_id, pr_line_id) SELECT * FROM UNNEST($1::int[], $2::int[]) ON CONFLICT DO NOTHING`, [reqIds, prLineIds]);
  }

  // --- purchase orders (one statement) ---
  if (result.pos.length) {
    await q(
      `INSERT INTO purchase_orders (run_id, po_id, supplier_id, plant, route, total_value, first_req_at)
       SELECT $1, * FROM UNNEST($2::text[], $3::text[], $4::text[], $5::text[], $6::numeric[], $7::timestamp[])`,
      [
        run.id,
        result.pos.map((p) => p.po_id),
        result.pos.map((p) => p.supplier_id),
        result.pos.map((p) => p.plant),
        result.pos.map((p) => p.route),
        result.pos.map((p) => p.total_value),
        result.pos.map((p) => p.first_req_at),
      ],
    );
  }

  // --- sourcing events (one statement) ---
  const seReq: number[] = [];
  const seType: string[] = [];
  const seSup: string[] = [];
  for (const req of reqs) {
    if (req.decision !== 'SOURCING_REQUEST') continue;
    const rid = idByGroup.get(req.group_id);
    if (!rid) continue;
    seReq.push(rid);
    seType.push(req.route);
    seSup.push(req.suggested_supplier_ids.join(';'));
  }
  if (seReq.length) {
    await q(`INSERT INTO sourcing_events (run_id, requirement_id, type, supplier_ids) SELECT $1, * FROM UNNEST($2::int[], $3::text[], $4::text[])`, [run.id, seReq, seType, seSup]);
  }

  // --- export snapshot (one statement) ---
  if (result.rows.length) {
    await q(
      `INSERT INTO run_rows
         (run_id, pr_line_id, sort_order, pr_no, pr_line, resolved_item_code, group_id, po_id, decision, route,
          supplier_id, unit_price, group_value_inr, suggested_supplier_ids, policy_version, reason)
       SELECT $1, * FROM UNNEST(
         $2::int[], $3::int[], $4::text[], $5::int[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[],
         $11::text[], $12::numeric[], $13::numeric[], $14::text[], $15::text[], $16::text[]
       )`,
      [
        run.id,
        result.rows.map((r) => lineId.get(`${r.pr_no}/${r.pr_line}`) ?? null),
        result.rows.map((r) => lineSort.get(`${r.pr_no}/${r.pr_line}`) ?? 0),
        result.rows.map((r) => r.pr_no),
        result.rows.map((r) => r.pr_line),
        result.rows.map((r) => r.resolved_item_code),
        result.rows.map((r) => r.group_id || null),
        result.rows.map((r) => r.po_id || null),
        result.rows.map((r) => r.decision || null),
        result.rows.map((r) => r.route),
        result.rows.map((r) => r.supplier_id || null),
        result.rows.map((r) => (r.unit_price === '' ? null : Number(r.unit_price))),
        result.rows.map((r) => (r.group_value_inr === '' ? null : Number(r.group_value_inr))),
        result.rows.map((r) => r.suggested_supplier_ids),
        result.rows.map((r) => r.policy_version || null),
        result.rows.map((r) => r.reason),
      ],
    );
  }

  // --- resolved item codes on the source lines (one statement) ---
  const updIds: number[] = [];
  const updCodes: string[] = [];
  for (const row of result.rows) {
    const id = lineId.get(`${row.pr_no}/${row.pr_line}`);
    if (id && row.resolved_item_code) {
      updIds.push(id);
      updCodes.push(row.resolved_item_code);
    }
  }
  if (updIds.length) {
    await q(
      `UPDATE pr_lines p SET resolved_item_code = v.code
       FROM (SELECT UNNEST($1::int[]) AS id, UNNEST($2::text[]) AS code) v WHERE p.id = v.id`,
      [updIds, updCodes],
    );
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
