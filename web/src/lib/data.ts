import { q } from '@/db';
import type { Contract, ContractLine, EngineInput, Item, PoRecord, PolicyDoc, Supplier } from '@/engine/types';

export interface DbLine {
  id: number;
  pr_no: string;
  pr_line: number;
  created_at: string;
  requester: string | null;
  department: string | null;
  plant: string;
  item_code: string | null;
  description: string;
  quantity: number;
  uom: string | null;
  estimated_unit_price: number | null;
  need_by_date: string;
  urgency: string;
}

export async function loadEngineBase(): Promise<Omit<EngineInput, 'prLines' | 'policies'>> {
  const [items, suppliers, plants, poHistory, contractRows, contractLineRows] = await Promise.all([
    q<Item>('SELECT item_code, description, uom, category, item_type, standard_price FROM items ORDER BY item_code'),
    q<Supplier>('SELECT supplier_id, name, city, categories, status, on_time_pct, quality_rating FROM suppliers ORDER BY supplier_id'),
    q<{ plant: string }>('SELECT plant FROM plants ORDER BY plant'),
    q<PoRecord>('SELECT po_number, po_date, supplier_id, item_code, quantity, uom, unit_price, plant, delivered_on_time FROM po_history ORDER BY po_date, po_number'),
    q<Contract>('SELECT contract_id, supplier_id, start_date, end_date, value_cap, consumed_value, source FROM contracts ORDER BY contract_id'),
    q<ContractLine>('SELECT contract_id, item_code, description, uom, rate FROM contract_lines ORDER BY contract_id, item_code'),
  ]);
  return {
    items,
    suppliers,
    plants: plants.map((p) => p.plant),
    poHistory,
    contracts: contractRows,
    contractLines: contractLineRows,
  };
}

export async function loadPolicies(): Promise<PolicyDoc[]> {
  const rows = await q<{ doc: PolicyDoc }>(
    `SELECT doc FROM policy_versions WHERE status IN ('active','superseded') ORDER BY effective_date ASC`,
  );
  return rows.map((r) => r.doc);
}

export function dbLineToEngine(l: DbLine) {
  return {
    pr_no: l.pr_no,
    pr_line: l.pr_line,
    created_at: String(l.created_at).slice(0, 16),
    requester: l.requester,
    department: l.department,
    plant: l.plant,
    item_code: l.item_code,
    description: l.description,
    quantity: Number(l.quantity),
    uom: l.uom,
    estimated_unit_price: l.estimated_unit_price == null ? null : Number(l.estimated_unit_price),
    need_by_date: String(l.need_by_date).slice(0, 10),
    urgency: l.urgency as 'Normal' | 'Emergency',
  };
}
