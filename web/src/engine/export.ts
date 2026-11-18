import type { ExportRow } from './types';

const COLUMNS = [
  'pr_no', 'pr_line', 'resolved_item_code', 'group_id', 'po_id', 'decision', 'route',
  'supplier_id', 'unit_price', 'group_value_inr', 'suggested_supplier_ids', 'policy_version', 'reason',
] as const;

function esc(v: string): string {
  if (v.includes('"')) v = v.replace(/"/g, '""');
  if (/[",\n\r]/.test(v)) return `"${v}"`;
  return v;
}

export function toCsv(rows: ExportRow[]): string {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    const values = COLUMNS.map((c) => esc(String(r[c] ?? '')));
    lines.push(values.join(','));
  }
  return lines.join('\n');
}
