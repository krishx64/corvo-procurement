import Papa from 'papaparse';
import { ensureSchema, q } from '@/db';
import { audit, bad, ok, actorFrom } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TYPES = ['items', 'suppliers', 'plants', 'po_history', 'contracts', 'contract_lines'] as const;
type UploadType = (typeof TYPES)[number];

export async function POST(req: Request) {
  try {
    await ensureSchema();
    const actor = actorFrom(req);
    const url = new URL(req.url);
    const type = url.searchParams.get('type') as UploadType | null;
    if (!type || !TYPES.includes(type)) return bad(`type must be one of ${TYPES.join(', ')}`);
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return bad('multipart field "file" (CSV) is required');
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
    if (parsed.errors.length) return bad(parsed.errors.slice(0, 3).map((e) => e.message).join('; '));
    const rows = parsed.data;
    let count = 0;

    if (type === 'items') {
      for (const r of rows) {
        if (!r.item_code) continue;
        await q(
          `INSERT INTO items (item_code, description, uom, category, item_type, standard_price) VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (item_code) DO UPDATE SET description=$2, uom=$3, category=$4, item_type=$5, standard_price=$6`,
          [r.item_code, r.description ?? '', r.uom ?? '', r.category ?? '', r.item_type ?? 'Material', Number(r.standard_price ?? 0)],
        );
        count++;
      }
    } else if (type === 'suppliers') {
      for (const r of rows) {
        if (!r.supplier_id) continue;
        await q(
          `INSERT INTO suppliers (supplier_id, name, city, categories, status, on_time_pct, quality_rating) VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (supplier_id) DO UPDATE SET name=$2, city=$3, categories=$4, status=$5, on_time_pct=$6, quality_rating=$7`,
          [r.supplier_id, r.name ?? '', r.city ?? null, r.categories ?? '', r.status ?? 'Active', Number(r.on_time_pct ?? 0), Number(r.quality_rating ?? 0)],
        );
        count++;
      }
    } else if (type === 'plants') {
      for (const r of rows) {
        if (!r.plant) continue;
        await q(`INSERT INTO plants (plant, name) VALUES ($1,$2) ON CONFLICT (plant) DO UPDATE SET name=$2`, [r.plant, r.name ?? r.plant]);
        count++;
      }
    } else if (type === 'po_history') {
      await q('DELETE FROM po_history');
      for (const r of rows) {
        if (!r.po_number || !r.item_code) continue;
        await q(
          `INSERT INTO po_history (po_number, po_date, supplier_id, item_code, quantity, uom, unit_price, plant, delivered_on_time)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [r.po_number, r.po_date, r.supplier_id, r.item_code, Number(r.quantity ?? 0), r.uom ?? null, Number(r.unit_price ?? 0), r.plant ?? null, String(r.delivered_on_time).toLowerCase() === 'true'],
        );
        count++;
      }
    } else if (type === 'contracts') {
      for (const r of rows) {
        if (!r.contract_id) continue;
        await q(
          `INSERT INTO contracts (contract_id, supplier_id, start_date, end_date, value_cap, consumed_value, source, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,'register',$7)
           ON CONFLICT (contract_id) DO UPDATE SET supplier_id=$2, start_date=$3, end_date=$4, value_cap=$5, consumed_value=$6`,
          [r.contract_id, r.supplier_id, r.start_date, r.end_date, Number(r.value_cap ?? 0), Number(r.consumed_value ?? 0), actor.name],
        );
        count++;
      }
    } else if (type === 'contract_lines') {
      for (const r of rows) {
        if (!r.contract_id || !r.item_code) continue;
        await q(
          `INSERT INTO contract_lines (contract_id, item_code, description, uom, rate) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (contract_id, item_code) DO UPDATE SET description=$3, uom=$4, rate=$5`,
          [r.contract_id, r.item_code, r.description ?? null, r.uom ?? null, Number(r.rate ?? 0)],
        );
        count++;
      }
    }

    await audit(actor, 'admin.upload', 'csv', type, { file: file.name, rows: count });
    return ok({ saved: count, type });
  } catch (e) {
    return bad(e instanceof Error ? e.message : 'upload failed', 500);
  }
}

export async function GET() {
  await ensureSchema();
  const [counts] = await q<any>(`
    SELECT
      (SELECT count(*)::int FROM items) AS items,
      (SELECT count(*)::int FROM suppliers) AS suppliers,
      (SELECT count(*)::int FROM po_history) AS po_history,
      (SELECT count(*)::int FROM contracts) AS contracts,
      (SELECT count(*)::int FROM contract_lines) AS contract_lines,
      (SELECT count(*)::int FROM policy_versions WHERE status='active') AS policy_versions,
      (SELECT count(*)::int FROM batches) AS batches,
      (SELECT count(*)::int FROM runs) AS runs,
      (SELECT count(*)::int FROM requirements) AS requirements
  `);
  return ok({ counts });
}
