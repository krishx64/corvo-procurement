import { ensureSchema, q } from '@/db';
import { audit, bad, ok, actorFrom } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureSchema();
  const contracts = await q(`SELECT * FROM contracts ORDER BY contract_id`);
  const lines = await q(`SELECT * FROM contract_lines ORDER BY contract_id, item_code`);
  return ok({ contracts, lines });
}

export async function POST(req: Request) {
  await ensureSchema();
  const actor = actorFrom(req);
  const body = await req.json().catch(() => null);
  if (!body) return bad('JSON body required');
  const { contract_id, supplier_id, start_date, end_date, value_cap, consumed_value, lines } = body as {
    contract_id?: string; supplier_id?: string; start_date?: string; end_date?: string;
    value_cap?: number; consumed_value?: number; lines?: Array<{ item_code: string; description?: string; uom?: string; rate: number }>;
  };
  if (!contract_id || !/^[A-Z0-9-]{4,40}$/.test(contract_id)) return bad('valid contract_id is required');
  if (!supplier_id) return bad('supplier_id is required');
  if (!start_date || !end_date) return bad('start_date and end_date are required');
  if (!Number.isFinite(Number(value_cap)) || Number(value_cap) <= 0) return bad('value_cap must be a positive number');
  if (!Array.isArray(lines) || lines.length === 0) return bad('at least one contract line is required');

  await q(
    `INSERT INTO contracts (contract_id, supplier_id, start_date, end_date, value_cap, consumed_value, source, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (contract_id) DO UPDATE SET supplier_id=$2, start_date=$3, end_date=$4, value_cap=$5, consumed_value=$6`,
    [contract_id, supplier_id, start_date, end_date, Number(value_cap), Number(consumed_value ?? 0), (body as any).source ?? 'manual', actor.name],
  );
  await q(`DELETE FROM contract_lines WHERE contract_id=$1`, [contract_id]);
  for (const l of lines) {
    if (!l.item_code || !Number.isFinite(Number(l.rate))) return bad('each contract line needs item_code and rate');
    await q(
      `INSERT INTO contract_lines (contract_id, item_code, description, uom, rate) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (contract_id, item_code) DO UPDATE SET description=$3, uom=$4, rate=$5`,
      [contract_id, l.item_code, l.description ?? null, l.uom ?? null, Number(l.rate)],
    );
  }
  await audit(actor, 'contract.upsert', 'contract', contract_id, { supplier_id, value_cap, lines: lines.length });
  return ok({ saved: true, contract_id });
}
