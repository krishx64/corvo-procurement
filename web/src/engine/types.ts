// Pure engine types — no DB/IO dependencies.

export type Urgency = 'Normal' | 'Emergency';

export interface PrLineInput {
  pr_no: string;
  pr_line: number;
  created_at: string; // 'YYYY-MM-DD HH:mm' (local plant time)
  requester?: string | null;
  department?: string | null;
  plant: string;
  item_code?: string | null;
  description: string;
  quantity: number;
  uom?: string | null;
  estimated_unit_price?: number | null;
  need_by_date?: string | null; // 'YYYY-MM-DD'
  urgency: Urgency;
}

export interface Item {
  item_code: string;
  description: string;
  uom: string;
  category: string;
  item_type: string;
  standard_price: number;
}

export interface Supplier {
  supplier_id: string;
  name: string;
  city: string;
  categories: string; // ';'-separated
  status: 'Active' | 'Inactive' | 'Blocked';
  on_time_pct: number;
  quality_rating: number;
}

export interface PoRecord {
  po_number: string;
  po_date: string; // 'YYYY-MM-DD'
  supplier_id: string;
  item_code: string;
  quantity: number;
  uom: string;
  unit_price: number;
  plant: string;
  delivered_on_time: boolean;
}

export interface Contract {
  contract_id: string;
  supplier_id: string;
  start_date: string;
  end_date: string;
  value_cap: number;
  consumed_value: number;
  source: 'register' | 'pdf';
}

export interface ContractLine {
  contract_id: string;
  item_code: string;
  description: string;
  uom: string;
  rate: number;
}

// ---------- Policy as data ----------

export type ConditionField =
  | 'item_type'
  | 'item_category'
  | 'plant'
  | 'value'
  | 'is_emergency'
  | 'usable_contract'
  | 'bought_from_active_supplier'
  | 'item_code'
  | 'uom';

export type ConditionOp = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'in';

export interface Condition {
  field: ConditionField;
  op: ConditionOp;
  value: unknown;
}

export interface DecisionRule {
  id: string;
  priority: number;
  conditions: Condition[];
  outcome: 'PO' | 'SOURCING_REQUEST';
  route: string;
  supplier?: 'contract' | 'first_preferred';
  price?: 'contract_rate' | 'reference_price';
  suggest_count?: number;
  note?: string;
}

export interface PolicyDoc {
  version: string;
  effective_date: string;
  description?: string;
  clubbing: {
    creation_window_days: number;
    need_by_window_days: number;
  };
  valuation: {
    po_history_days: number;
    out_of_ceiling_fallback: 'lowest_applicable_contract_rate';
  };
  contracts: {
    require_active_supplier: boolean;
  };
  decision_rules: DecisionRule[];
  preferred_suppliers: {
    history_days: number;
    recency_tier1_days: number;
    recency_tier2_days: number;
    frequency_cap: number;
    weights: { recency: number; frequency: number; contract: number; on_time: number; quality: number };
    topup_order: 'on_time_x_quality';
  };
  po_consolidation: {
    window_hours: number;
    same_supplier: boolean;
    same_plant: boolean;
    same_route: boolean;
  };
}

export interface RuleContext
  extends Omit<Record<ConditionField, unknown>, 'value'> {
  item_type: string;
  item_category: string;
  plant: string;
  value: number;
  is_emergency: boolean;
  usable_contract: boolean;
  bought_from_active_supplier: boolean;
  item_code: string;
  uom: string;
}

// ---------- Engine results ----------

export interface Requirement {
  id: string; // temporary within-run id
  group_id: string; // REQ-0001 style, assigned in output
  lines: PrLineInput[];
  first_line_at: string;
  need_by_date: string;
  plant: string;
  item?: Item; // undefined => new item
  total_qty: number;
  is_emergency: boolean;
}

export interface RequirementResult {
  group_id: string;
  item_code: string; // resolved code or 'NEW'
  item_description: string;
  plant: string;
  first_line_at: string;
  need_by_date: string;
  is_emergency: boolean;
  total_qty: number;
  unit_price: number | null;
  value: number;
  decision: 'PO' | 'SOURCING_REQUEST';
  route: string;
  rule_id: string;
  supplier_id: string | null;
  po_id: string | null;
  suggested_supplier_ids: string[];
  policy_version: string;
  reason: string;
  contract_id: string | null;
  ref_po_number: string | null;
  lines: PrLineInput[];
  status: 'PENDING';
}

export interface ExportRow {
  pr_no: string;
  pr_line: number;
  resolved_item_code: string;
  group_id: string;
  po_id: string;
  decision: string;
  route: string;
  supplier_id: string;
  unit_price: string;
  group_value_inr: string;
  suggested_supplier_ids: string;
  policy_version: string;
  reason: string;
}

export interface PoHeader {
  po_id: string;
  supplier_id: string;
  plant: string;
  route: string;
  requirement_ids: string[];
  total_value: number;
}

export interface EngineInput {
  prLines: PrLineInput[];
  items: Item[];
  suppliers: Supplier[];
  poHistory: PoRecord[];
  contracts: Contract[];
  contractLines: ContractLine[];
  policies: PolicyDoc[]; // any order; selected per requirement date
}

export interface EngineResult {
  requirements: RequirementResult[];
  rows: ExportRow[];
  pos: PoHeader[];
  warnings: string[];
  policyVersionsUsed: string[];
}
