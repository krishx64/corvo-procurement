import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { loadDefaultPolicy } from './policy';
import type { Contract, ContractLine, EngineInput, Item, PoRecord, PrLineInput, Supplier } from './types';

/**
 * Loader for the task kit data. The kit files are intentionally NOT committed
 * to this public repo; golden tests run only when KIT_DIR (or the default
 * sibling folder) is present on the machine.
 */
export function kitDir(): string | null {
  const candidates = [process.env.KIT_DIR, path.resolve(__dirname, '../../../Cantill_FullStack_Task_Kit')].filter(Boolean) as string[];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'pr_batches/sample_pr_batch.csv'))) return c;
  }
  return null;
}

function csv<T>(dir: string, rel: string): T[] {
  const text = fs.readFileSync(path.join(dir, rel), 'utf8');
  return Papa.parse<T>(text, { header: true, skipEmptyLines: true }).data;
}

export function loadKit(dir = kitDir()!): EngineInput {
  const items: Item[] = csv<any>(dir, 'master_data/item_master.csv').map((r) => ({
    item_code: r.item_code, description: r.description, uom: r.uom, category: r.category, item_type: r.item_type, standard_price: Number(r.standard_price),
  }));
  const suppliers: Supplier[] = csv<any>(dir, 'master_data/supplier_master.csv').map((r) => ({
    supplier_id: r.supplier_id, name: r.name, city: r.city, categories: r.categories, status: r.status, on_time_pct: Number(r.on_time_pct), quality_rating: Number(r.quality_rating),
  }));
  const poHistory: PoRecord[] = csv<any>(dir, 'master_data/po_history.csv').map((r) => ({
    po_number: r.po_number, po_date: r.po_date, supplier_id: r.supplier_id, item_code: r.item_code, quantity: Number(r.quantity), uom: r.uom,
    unit_price: Number(r.unit_price), plant: r.plant, delivered_on_time: String(r.delivered_on_time).toLowerCase() === 'true',
  }));
  const contracts: Contract[] = csv<any>(dir, 'contracts/contract_register.csv').map((r) => ({
    contract_id: r.contract_id, supplier_id: r.supplier_id, start_date: r.start_date, end_date: r.end_date,
    value_cap: Number(r.value_cap), consumed_value: Number(r.consumed_value), source: 'register' as const,
  }));
  const contractLines: ContractLine[] = csv<any>(dir, 'contracts/contract_lines.csv').map((r) => ({
    contract_id: r.contract_id, item_code: r.item_code, description: r.description, uom: r.uom, rate: Number(r.rate),
  }));
  // The two signed-after-register contracts live only as PDFs in contracts/pdf;
  // in the app they arrive via the contract PDF extractor. Values from those PDFs:
  contracts.push(
    { contract_id: 'RC-2026-031', supplier_id: 'S021', start_date: '2026-11-15', end_date: '2027-11-14', value_cap: 2000000, consumed_value: 0, source: 'pdf' },
    { contract_id: 'RC-2026-033', supplier_id: 'S035', start_date: '2026-11-20', end_date: '2027-11-19', value_cap: 5000000, consumed_value: 0, source: 'pdf' },
  );
  contractLines.push(
    { contract_id: 'RC-2026-031', item_code: 'ITM-1036', description: 'Pneumatic cylinder 50x100', uom: 'NOS', rate: 3537.76 },
    { contract_id: 'RC-2026-031', item_code: 'ITM-1037', description: 'Solenoid valve 5/2 1/4 inch', uom: 'NOS', rate: 2439.01 },
    { contract_id: 'RC-2026-031', item_code: 'ITM-1039', description: 'FRL unit 1/2 inch', uom: 'NOS', rate: 2746.87 },
    { contract_id: 'RC-2026-033', item_code: 'ITM-1056', description: 'Laptop i5 16GB 512GB', uom: 'NOS', rate: 64654.36 },
    { contract_id: 'RC-2026-033', item_code: 'ITM-1057', description: '24 inch monitor', uom: 'NOS', rate: 10689.51 },
  );
  const prLines: PrLineInput[] = csv<any>(dir, 'pr_batches/sample_pr_batch.csv').map((r) => ({
    pr_no: r.pr_no, pr_line: Number(r.pr_line), created_at: r.created_at, requester: r.requester, department: r.department, plant: r.plant,
    item_code: r.item_code || null, description: r.description, quantity: Number(r.quantity), uom: r.uom || null,
    estimated_unit_price: r.estimated_unit_price ? Number(r.estimated_unit_price) : null, need_by_date: r.need_by_date, urgency: r.urgency,
  }));
  return { prLines, items, suppliers, poHistory, contracts, contractLines, policies: [loadDefaultPolicy()], plants: ['PUN1', 'CHK1'] };
}
