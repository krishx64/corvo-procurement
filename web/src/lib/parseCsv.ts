import Papa from 'papaparse';

export interface ParsedPrLine {
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
  urgency: 'Normal' | 'Emergency';
}

const REQUIRED = ['pr_no', 'pr_line', 'created_at', 'plant', 'description', 'quantity', 'need_by_date'];

function normDate(v: string): string {
  return v.trim().replace('T', ' ').slice(0, 16);
}

export function parsePrCsv(text: string): { lines: ParsedPrLine[]; errors: string[] } {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const errors: string[] = [];
  if (parsed.errors.length) {
    for (const e of parsed.errors.slice(0, 5)) errors.push(`row ${e.row ?? '?'}: ${e.message}`);
  }
  const fields = parsed.meta.fields ?? [];
  for (const req of REQUIRED) {
    if (!fields.includes(req)) errors.push(`missing column: ${req}`);
  }
  if (errors.length) return { lines: [], errors };

  const lines: ParsedPrLine[] = [];
  parsed.data.forEach((r, i) => {
    const pr_no = (r.pr_no ?? '').trim();
    const quantity = Number(r.quantity);
    const prLine = Number(r.pr_line);
    if (!pr_no) errors.push(`row ${i + 2}: pr_no is empty`);
    if (!Number.isFinite(prLine) || prLine <= 0) errors.push(`row ${i + 2}: pr_line invalid`);
    if (!Number.isFinite(quantity)) errors.push(`row ${i + 2}: quantity invalid`);
    lines.push({
      pr_no,
      pr_line: prLine,
      created_at: normDate(r.created_at ?? ''),
      requester: (r.requester ?? '').trim() || null,
      department: (r.department ?? '').trim() || null,
      plant: (r.plant ?? '').trim().toUpperCase(),
      item_code: (r.item_code ?? '').trim() || null,
      description: (r.description ?? '').trim(),
      quantity,
      uom: (r.uom ?? '').trim() || null,
      estimated_unit_price: (r.estimated_unit_price ?? '').trim() ? Number(r.estimated_unit_price) : null,
      need_by_date: (r.need_by_date ?? '').trim().slice(0, 10),
      urgency: (r.urgency ?? '').trim().toLowerCase() === 'emergency' ? 'Emergency' : 'Normal',
    });
  });
  return { lines, errors };
}
