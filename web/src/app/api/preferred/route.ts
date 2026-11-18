import { ensureSchema, q } from '@/db';
import { bad, ok, csvResponse } from '@/lib/api';
import { loadEngineBase, loadPolicies } from '@/lib/data';
import { policyForDate } from '@/engine/policy';
import { preferredList } from '@/engine/preferred';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  await ensureSchema();
  const url = new URL(req.url);
  const itemCode = url.searchParams.get('item_code');
  const asOf = url.searchParams.get('as_of') || new Date().toISOString().slice(0, 10);
  if (!itemCode) return bad('item_code is required');

  const base = await loadEngineBase();
  const policies = await loadPolicies();
  if (!policies.length) return bad('no active policy version', 500);
  const policy = policyForDate(policies, asOf);
  const item = base.items.find((i) => i.item_code === itemCode);
  if (!item) return bad('item not found', 404);

  const entries = preferredList(itemCode, asOf, base.suppliers, base.poHistory, base.contracts, base.contractLines, policy);
  return ok({ item, as_of: asOf, policy_version: policy.version, entries });
}

export async function POST(req: Request) {
  // POST = bulk export helper: { item_codes?: string[], as_of: string, format?: 'csv' }
  await ensureSchema();
  const body = await req.json().catch(() => ({}));
  const asOf = body.as_of || new Date().toISOString().slice(0, 10);
  const base = await loadEngineBase();
  const policies = await loadPolicies();
  const policy = policyForDate(policies, asOf);
  const items = body.item_codes?.length ? base.items.filter((i) => body.item_codes.includes(i.item_code)) : base.items;
  const rows: string[] = ['item_code,rank,supplier_id,reference_price'];
  for (const item of items) {
    const entries = preferredList(item.item_code, asOf, base.suppliers, base.poHistory, base.contracts, base.contractLines, policy);
    entries.slice(0, 3).forEach((e, i) => {
      rows.push(`${item.item_code},${i + 1},${e.supplier_id},${e.reference_price == null ? '' : e.reference_price.toFixed(2)}`);
    });
  }
  if (body.format === 'csv') return csvResponse(rows.join('\n'), `preferred-suppliers-${asOf}.csv`);
  return ok({ as_of: asOf, lines: rows.slice(1) });
}
