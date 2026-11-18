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

  const [batch] = await q<{ id: number }>(
    `INSERT INTO batches (name, source, created_by) VALUES ($1,$2,$3) RETURNING id`,
    [name.slice(0, 200), 'csv', actor.name],
  );

  let accepted = 0;
  let duplicates = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const res = await q<{ id: number }>(
      `INSERT INTO pr_lines
        (batch_id, pr_no, pr_line, created_at, requester, department, plant, item_code, description, quantity, uom,
         estimated_unit_price, need_by_date, urgency, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (batch_id, pr_no, pr_line) DO NOTHING RETURNING id`,
      [batch.id, l.pr_no, l.pr_line, l.created_at, l.requester, l.department, l.plant, l.item_code, l.description,
        l.quantity, l.uom, l.estimated_unit_price, l.need_by_date, l.urgency, i],
    );
    if (res.length) accepted++;
    else duplicates++;
  }

  await audit(actor, 'batch.upload', 'batch', batch.id, { name, accepted, duplicates });
  return { batchId: batch.id, accepted, duplicates, errors: [] };
}

export async function insertPrLineBatch(batchId: number, l: ReturnType<typeof parsePrCsv>['lines'][number], sortOrder: number): Promise<number | null> {
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
