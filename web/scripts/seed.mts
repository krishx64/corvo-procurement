/**
 * Seeds the database from the task kit directory (kept OUT of the public repo).
 *
 *   npm run seed -- --dir "C:\\path\\to\\Cantill_FullStack_Task_Kit"
 *
 * Reads: master_data/*.csv, contracts/contract_register.csv, contract_lines.csv,
 * contracts/pdf/*.pdf (signed-after-register contracts), and the shipped policy v5.0.
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { Pool } from 'pg';
import { SCHEMA_SQL } from '../src/db/schema.ts';
import { pdfText, parseContractText } from '../src/lib/pdf.ts';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const dir = path.resolve(arg('dir', path.resolve(process.cwd(), '..', 'Cantill_FullStack_Task_Kit'))!);
const dbUrl = arg('db') ?? process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('DATABASE_URL (or --db) is required');
  process.exit(1);
}
if (!fs.existsSync(path.join(dir, 'master_data', 'item_master.csv'))) {
  console.error(`Kit data not found at ${dir} — pass --dir`);
  process.exit(1);
}

function csv<T>(rel: string): T[] {
  const text = fs.readFileSync(path.join(dir, rel), 'utf8');
  const parsed = Papa.parse<T>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
  if (parsed.errors.length) throw new Error(`${rel}: ${parsed.errors[0].message}`);
  return parsed.data;
}

async function main() {
  const pool = new Pool({ connectionString: dbUrl, ssl: dbUrl!.includes('neon.tech') ? { rejectUnauthorized: false } : undefined });
  const client = await pool.connect();
  try {
    await client.query(SCHEMA_SQL);
    await client.query(`TRUNCATE TABLE run_rows, requirement_lines, requirements, sourcing_events, purchase_orders,
      runs, pr_lines, batches, contract_lines, contracts, po_history, items, suppliers, plants, policy_versions, audit_log
      RESTART IDENTITY CASCADE`);
    await client.query('BEGIN');

    const items = csv<any>('master_data/item_master.csv');
    for (const r of items) {
      await client.query(
        `INSERT INTO items (item_code, description, uom, category, item_type, standard_price) VALUES ($1,$2,$3,$4,$5,$6)`,
        [r.item_code, r.description, r.uom, r.category, r.item_type, Number(r.standard_price)],
      );
    }

    const suppliers = csv<any>('master_data/supplier_master.csv');
    for (const r of suppliers) {
      await client.query(
        `INSERT INTO suppliers (supplier_id, name, city, categories, status, on_time_pct, quality_rating) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [r.supplier_id, r.name, r.city, r.categories, r.status, Number(r.on_time_pct), Number(r.quality_rating)],
      );
    }

    const plants = csv<any>('master_data/plants.csv');
    for (const r of plants) {
      await client.query(`INSERT INTO plants (plant, name) VALUES ($1,$2)`, [r.plant, r.name]);
    }

    const pos = csv<any>('master_data/po_history.csv');
    for (const r of pos) {
      await client.query(
        `INSERT INTO po_history (po_number, po_date, supplier_id, item_code, quantity, uom, unit_price, plant, delivered_on_time)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [r.po_number, r.po_date, r.supplier_id, r.item_code, Number(r.quantity), r.uom, Number(r.unit_price), r.plant, String(r.delivered_on_time).toLowerCase() === 'true'],
      );
    }

    const contracts = csv<any>('contracts/contract_register.csv');
    for (const r of contracts) {
      await client.query(
        `INSERT INTO contracts (contract_id, supplier_id, start_date, end_date, value_cap, consumed_value, source)
         VALUES ($1,$2,$3,$4,$5,$6,'register')`,
        [r.contract_id, r.supplier_id, r.start_date, r.end_date, Number(r.value_cap), Number(r.consumed_value)],
      );
    }

    const lines = csv<any>('contracts/contract_lines.csv');
    for (const r of lines) {
      await client.query(
        `INSERT INTO contract_lines (contract_id, item_code, description, uom, rate) VALUES ($1,$2,$3,$4,$5)`,
        [r.contract_id, r.item_code, r.description, r.uom, Number(r.rate)],
      );
    }

    // Signed-after-register contracts exist only as PDFs — run them through the app's extractor.
    const pdfDir = path.join(dir, 'contracts', 'pdf');
    let pdfContracts = 0;
    let pdfLines = 0;
    if (fs.existsSync(pdfDir)) {
      const known = new Set(contracts.map((c) => c.contract_id));
      for (const file of fs.readdirSync(pdfDir).filter((f) => f.toLowerCase().endsWith('.pdf'))) {
        const text = await pdfText(new Uint8Array(fs.readFileSync(path.join(pdfDir, file))));
        const d = parseContractText(text);
        if (!d.contract_id || known.has(d.contract_id)) continue;
        if (!d.supplier_id || !d.start_date || !d.end_date || d.value_cap == null || d.lines.length === 0) {
          console.warn(`  ! could not fully extract ${file} — skipping`);
          continue;
        }
        await client.query(
          `INSERT INTO contracts (contract_id, supplier_id, start_date, end_date, value_cap, consumed_value, source, created_by)
           VALUES ($1,$2,$3,$4,$5,0,'pdf','seed')`,
          [d.contract_id, d.supplier_id, d.start_date, d.end_date, d.value_cap],
        );
        for (const l of d.lines) {
          await client.query(
            `INSERT INTO contract_lines (contract_id, item_code, description, uom, rate) VALUES ($1,$2,$3,$4,$5)`,
            [d.contract_id, l.item_code, l.description, l.uom, l.rate],
          );
          pdfLines++;
        }
        pdfContracts++;
        console.log(`  + PDF contract ${d.contract_id} (${d.supplier_id}) ${d.start_date}→${d.end_date}, ${d.lines.length} lines`);
      }
    }

    const policy = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/engine/policy-v5.json'), 'utf8'));
    await client.query(
      `INSERT INTO policy_versions (version, effective_date, status, doc, source_note, created_by, approved_at, approved_by)
       VALUES ($1,$2,'active',$3,$4,'seed',now(),'seed')`,
      [policy.version, policy.effective_date, JSON.stringify(policy), 'Corvo Procurement Policy v5.0 (CORVO-PROC-POL-04)'],
    );

    await client.query('COMMIT');
    console.log(`Seeded: ${items.length} items, ${suppliers.length} suppliers, ${plants.length} plants, ${pos.length} PO rows, ${contracts.length} register contracts (+${pdfContracts} PDF), ${lines.length + pdfLines} contract lines, policy v${policy.version}.`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
