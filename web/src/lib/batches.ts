import { ensureSchema, q } from '@/db';
import { audit, type Actor } from './api';
import { parsePrCsv } from './parseCsv';

export interface CreateBatchResult {
  batchId: number;
  accepted: number;
  duplicates: number;
  errors: string[];
}

export async function createBatchFromCsv(text: string, name: string, actor: Actor): Promise<CreateBatchResult> {
  await ensureSchema();
  const { lines, errors } = parsePrCsv(text);
  if (errors.length) return { batchId: 0, accepted: 0, duplicates: 0, errors };
  if (lines.length === 0) return { batchId: 0, accepted: 0, duplicates: 0, errors: ['no PR lines found'] };

  const [batch] = await q<{ id: number }>(
    `INSERT INTO batches (name, source, created_by) VALUES ($1,$2,$3) RETURNING id`,
    [name.slice(0, 200), 'csv', actor.name],
  );

  // One round-trip for the whole CSV (Neon latency makes row-by-row inserts slow).
  const inserted = await q<{ id: number }>(
    `INSERT INTO pr_lines
       (batch_id, pr_no, pr_line, created_at, requester, department, plant, item_code, description,
        quantity, uom, estimated_unit_price, need_by_date, urgency, sort_order)
     SELECT $1, * FROM UNNEST(
       $2::text[], $3::int[], $4::timestamp[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[],
       $10::numeric[], $11::text[], $12::numeric[], $13::date[], $14::text[], $15::int[]
     )
     ON CONFLICT (batch_id, pr_no, pr_line) DO NOTHING
     RETURNING id`,
    [
      batch.id,
      lines.map((l) => l.pr_no),
      lines.map((l) => l.pr_line),
      lines.map((l) => l.created_at),
      lines.map((l) => l.requester),
      lines.map((l) => l.department),
      lines.map((l) => l.plant),
      lines.map((l) => l.item_code),
      lines.map((l) => l.description),
      lines.map((l) => l.quantity),
      lines.map((l) => l.uom),
      lines.map((l) => l.estimated_unit_price),
      lines.map((l) => l.need_by_date),
      lines.map((l) => l.urgency),
      lines.map((_, i) => i),
    ],
  );

  const accepted = inserted.length;
  const duplicates = lines.length - accepted;
  await audit(actor, 'batch.upload', 'batch', batch.id, { name, accepted, duplicates });
  return { batchId: batch.id, accepted, duplicates, errors: [] };
}

export async function insertPrLineBatch(
  batchId: number,
  l: ReturnType<typeof parsePrCsv>['lines'][number],
  sortOrder: number,
): Promise<number | null> {
  const res = await q<{ id: number }>(
    `INSERT INTO pr_lines
      (batch_id, pr_no, pr_line, created_at, requester, department, plant, item_code, description, quantity, uom,
       estimated_unit_price, need_by_date, urgency, sort_order, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'chat')
     ON CONFLICT (batch_id, pr_no, pr_line) DO NOTHING RETURNING id`,
    [batchId, l.pr_no, l.pr_line, l.created_at, l.requester, l.department, l.plant, l.item_code, l.description,
      l.quantity, l.uom, l.estimated_unit_price, l.need_by_date, l.urgency, sortOrder],
  );
  return res[0]?.id ?? null;
}
