import { ensureSchema } from '@/db';
import { csvResponse } from '@/lib/api';
import { loadEngineBase, loadPolicies } from '@/lib/data';
import { policyForDate } from '@/engine/policy';
import { preferredList } from '@/engine/preferred';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  await ensureSchema();
  const url = new URL(req.url);
  const asOf = url.searchParams.get('as_of') || new Date().toISOString().slice(0, 10);
  const base = await loadEngineBase();
  const policies = await loadPolicies();
  const policy = policyForDate(policies, asOf);

  const rows: string[] = ['item_code,rank,supplier_id,reference_price'];
  for (const item of base.items) {
    const entries = preferredList(item.item_code, asOf, base.suppliers, base.poHistory, base.contracts, base.contractLines, policy);
    entries.slice(0, 3).forEach((e, i) => {
      rows.push(`${item.item_code},${i + 1},${e.supplier_id},${e.reference_price == null ? '' : e.reference_price.toFixed(2)}`);
    });
  }
  return csvResponse(rows.join('\n'), `preferred-suppliers-${asOf}.csv`);
}
