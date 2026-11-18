// Embedded schema: running this file's output twice must be a no-op.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS items (
  item_code TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  uom TEXT NOT NULL,
  category TEXT NOT NULL,
  item_type TEXT NOT NULL,
  standard_price NUMERIC(14,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  supplier_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT,
  categories TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  on_time_pct NUMERIC(5,1) NOT NULL DEFAULT 0,
  quality_rating NUMERIC(3,1) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plants (
  plant TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS po_history (
  id SERIAL PRIMARY KEY,
  po_number TEXT NOT NULL,
  po_date DATE NOT NULL,
  supplier_id TEXT NOT NULL,
  item_code TEXT NOT NULL,
  quantity NUMERIC(14,4) NOT NULL,
  uom TEXT,
  unit_price NUMERIC(14,4) NOT NULL,
  plant TEXT,
  delivered_on_time BOOLEAN
);
CREATE INDEX IF NOT EXISTS po_history_item_idx ON po_history(item_code);
CREATE INDEX IF NOT EXISTS po_history_supplier_idx ON po_history(supplier_id);

CREATE TABLE IF NOT EXISTS contracts (
  contract_id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  value_cap NUMERIC(16,2) NOT NULL,
  consumed_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'register',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS contract_lines (
  contract_id TEXT NOT NULL REFERENCES contracts(contract_id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  description TEXT,
  uom TEXT,
  rate NUMERIC(14,4) NOT NULL,
  PRIMARY KEY (contract_id, item_code)
);

CREATE TABLE IF NOT EXISTS policy_versions (
  id SERIAL PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  effective_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  doc JSONB NOT NULL,
  source_note TEXT,
  changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  approved_at TIMESTAMPTZ,
  approved_by TEXT
);

CREATE TABLE IF NOT EXISTS batches (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'csv',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS pr_lines (
  id SERIAL PRIMARY KEY,
  batch_id INT REFERENCES batches(id) ON DELETE CASCADE,
  pr_no TEXT NOT NULL,
  pr_line INT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  requester TEXT,
  department TEXT,
  plant TEXT NOT NULL,
  item_code TEXT,
  description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(14,3) NOT NULL,
  uom TEXT,
  estimated_unit_price NUMERIC(14,2),
  need_by_date DATE NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'Normal',
  resolved_item_code TEXT,
  source TEXT NOT NULL DEFAULT 'batch',
  sort_order INT NOT NULL DEFAULT 0
);
-- PR numbers are unique per batch (a new blind-test batch may reuse the sample numbering).
ALTER TABLE pr_lines DROP CONSTRAINT IF EXISTS pr_lines_pr_no_pr_line_key;
CREATE UNIQUE INDEX IF NOT EXISTS pr_lines_batch_pr_uniq ON pr_lines(batch_id, pr_no, pr_line);
CREATE INDEX IF NOT EXISTS pr_lines_batch_idx ON pr_lines(batch_id);

CREATE TABLE IF NOT EXISTS runs (
  id SERIAL PRIMARY KEY,
  batch_id INT REFERENCES batches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  policy_versions TEXT,
  stats JSONB
);

CREATE TABLE IF NOT EXISTS requirements (
  id SERIAL PRIMARY KEY,
  run_id INT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  item_code TEXT NOT NULL,
  item_description TEXT,
  plant TEXT NOT NULL,
  first_line_at TIMESTAMP NOT NULL,
  need_by_date DATE NOT NULL,
  is_emergency BOOLEAN NOT NULL DEFAULT false,
  total_qty NUMERIC(14,3) NOT NULL,
  unit_price NUMERIC(14,4),
  value NUMERIC(16,2) NOT NULL,
  decision TEXT NOT NULL,
  route TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  supplier_id TEXT,
  po_id TEXT,
  suggested_supplier_ids TEXT,
  policy_version TEXT NOT NULL,
  reason TEXT NOT NULL,
  contract_id TEXT,
  ref_po_number TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  override_route TEXT,
  override_supplier_id TEXT,
  override_reason TEXT,
  override_at TIMESTAMPTZ,
  override_by TEXT
);
CREATE INDEX IF NOT EXISTS requirements_run_idx ON requirements(run_id);

CREATE TABLE IF NOT EXISTS requirement_lines (
  requirement_id INT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  pr_line_id INT NOT NULL REFERENCES pr_lines(id) ON DELETE CASCADE,
  PRIMARY KEY (requirement_id, pr_line_id)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  run_id INT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  po_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  plant TEXT NOT NULL,
  route TEXT NOT NULL,
  total_value NUMERIC(16,2) NOT NULL,
  first_req_at TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by TEXT
);
CREATE INDEX IF NOT EXISTS po_run_idx ON purchase_orders(run_id);

CREATE TABLE IF NOT EXISTS sourcing_events (
  id SERIAL PRIMARY KEY,
  run_id INT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  requirement_id INT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  supplier_ids TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by TEXT
);

CREATE TABLE IF NOT EXISTS run_rows (
  id SERIAL PRIMARY KEY,
  run_id INT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  pr_line_id INT REFERENCES pr_lines(id) ON DELETE CASCADE,
  sort_order INT NOT NULL,
  pr_no TEXT NOT NULL,
  pr_line INT NOT NULL,
  resolved_item_code TEXT,
  group_id TEXT,
  po_id TEXT,
  decision TEXT,
  route TEXT,
  supplier_id TEXT,
  unit_price NUMERIC(14,4),
  group_value_inr NUMERIC(16,2),
  suggested_supplier_ids TEXT,
  policy_version TEXT,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS run_rows_run_idx ON run_rows(run_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT NOT NULL,
  role TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  details JSONB
);
CREATE INDEX IF NOT EXISTS audit_at_idx ON audit_log(at DESC);
`;
