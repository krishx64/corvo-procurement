import { dayDiff } from './dates';
import type { Contract, ContractLine, Item, PolicyDoc, PoRecord, Supplier } from './types';

export interface PreferredEntry {
  supplier_id: string;
  status: string;
  po_count: number;
  recency: number;
  has_contract: boolean;
  on_time: number;
  quality: number;
  score: number;
  reference_price: number | null;
  ref_po_number?: string;
  ref_source: 'po' | 'contract' | 'none';
}

/**
 * Policy 6.1-6.3. Ranking is our documented design (DECISIONS.md):
 * score = 35*recency + 25*freq + 20*has_contract + 10*on_time + 10*quality,
 * validated against all worked-example lists.
 */
export function preferredList(
  itemCode: string,
  asOf: string,
  suppliers: Supplier[],
  poHistory: PoRecord[],
  contracts: Contract[],
  contractLines: ContractLine[],
  policy: PolicyDoc,
): PreferredEntry[] {
  const day = asOf.slice(0, 10);
  const cfg = policy.preferred_suppliers;
  const entries: PreferredEntry[] = [];

  for (const sup of suppliers) {
    if (sup.status !== 'Active') continue;

    const pos = poHistory
      .filter((p) => p.item_code === itemCode && p.supplier_id === sup.supplier_id)
      .filter((p) => {
        const d = dayDiff(p.po_date, day);
        return d >= 0 && d <= cfg.history_days;
      })
      .sort((a, b) => (a.po_date < b.po_date ? 1 : a.po_date > b.po_date ? -1 : a.po_number < b.po_number ? 1 : -1));

    const supContracts = contractLines
      .filter((cl) => cl.item_code === itemCode)
      .map((cl) => ({ cl, c: contracts.find((x) => x.contract_id === cl.contract_id) }))
      .filter((x): x is { cl: ContractLine; c: Contract } => !!x.c && x.c.supplier_id === sup.supplier_id && x.c.start_date.slice(0, 10) <= day)
      .sort((a, b) => (a.c.start_date < b.c.start_date ? 1 : a.c.start_date > b.c.start_date ? -1 : a.c.contract_id < b.c.contract_id ? 1 : -1));

    const hasContract = supContracts.length > 0;
    if (pos.length === 0 && !hasContract) continue;

    const lastPo = pos[0];
    const lastDays = lastPo ? dayDiff(lastPo.po_date, day) : Number.POSITIVE_INFINITY;
    const recency = !lastPo ? 0 : lastDays <= cfg.recency_tier1_days ? 1 : lastDays <= cfg.recency_tier2_days ? 0.5 : 0;
    const poCount = pos.length;

    let reference_price: number | null = null;
    let ref_po_number: string | undefined;
    let ref_source: 'po' | 'contract' | 'none' = 'none';
    if (lastPo) {
      reference_price = lastPo.unit_price;
      ref_po_number = lastPo.po_number;
      ref_source = 'po';
    } else if (hasContract) {
      reference_price = supContracts[0].cl.rate;
      ref_source = 'contract';
    }

    const freq = Math.min(poCount, cfg.frequency_cap) / cfg.frequency_cap;
    const score =
      cfg.weights.recency * recency +
      cfg.weights.frequency * freq +
      cfg.weights.contract * (hasContract ? 1 : 0) +
      cfg.weights.on_time * (sup.on_time_pct / 100) +
      cfg.weights.quality * (sup.quality_rating / 5);

    entries.push({
      supplier_id: sup.supplier_id,
      status: sup.status,
      po_count: poCount,
      recency,
      has_contract: hasContract,
      on_time: sup.on_time_pct,
      quality: sup.quality_rating,
      score: Math.round(score * 100) / 100,
      reference_price,
      ref_po_number,
      ref_source,
    });
  }

  return entries.sort((a, b) => b.score - a.score || a.supplier_id.localeCompare(b.supplier_id));
}

/**
 * Policy 6.4: preferred list first; top up with other Active suppliers that
 * list the item's category, best on-time x quality first. New items: none.
 */
export function suggestionsFor(
  item: Item | undefined,
  asOf: string,
  count: number,
  suppliers: Supplier[],
  poHistory: PoRecord[],
  contracts: Contract[],
  contractLines: ContractLine[],
  policy: PolicyDoc,
): string[] {
  if (!item) return [];
  const preferred = preferredList(item.item_code, asOf, suppliers, poHistory, contracts, contractLines, policy).map((e) => e.supplier_id);
  const out = preferred.slice(0, count);
  if (out.length >= count) return out;

  const topup = suppliers
    .filter((s) => s.status === 'Active')
    .filter((s) => !out.includes(s.supplier_id))
    .filter((s) => s.categories.split(';').map((c) => c.trim()).includes(item.category))
    .sort((a, b) => b.on_time_pct * b.quality_rating - a.on_time_pct * a.quality_rating || a.supplier_id.localeCompare(b.supplier_id));

  for (const s of topup) {
    if (out.length >= count) break;
    out.push(s.supplier_id);
  }
  return out;
}
