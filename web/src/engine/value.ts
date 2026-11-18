import { dayDiff } from './dates';
import type { ContractSelection } from './contracts';
import type { Item, PolicyDoc, PoRecord } from './types';

export type ValuationBasis = 'contract' | 'contract_out_of_ceiling' | 'po' | 'standard';

export interface Valuation {
  unit_price: number | null;
  basis: ValuationBasis | 'missing';
  ref_po_number?: string;
  note: string;
}

/** Policy 3.1: (a) contract rate used / lowest applicable rate, (b) most recent PO <=365d, (c) standard price. */
export function valueRequirement(
  quantity: number,
  reqDate: string,
  item: Item | undefined,
  selection: ContractSelection,
  poHistory: PoRecord[],
  policy: PolicyDoc,
): Valuation {
  if (selection.selected) {
    return {
      unit_price: selection.selected.rate,
      basis: 'contract',
      note: `contract ${selection.selected.contract.contract_id} rate ${selection.selected.rate}`,
    };
  }
  if (selection.applicable.length > 0 && selection.lowestApplicableRate != null) {
    return {
      unit_price: selection.lowestApplicableRate,
      basis: 'contract_out_of_ceiling',
      note: `all applicable contracts out of ceiling; valued at lowest applicable rate ${selection.lowestApplicableRate}`,
    };
  }
  if (!item) {
    return { unit_price: null, basis: 'missing', note: 'new item has no estimate' };
  }
  const window = policy.valuation.po_history_days;
  const candidates = poHistory
    .filter((p) => p.item_code === item.item_code)
    .filter((p) => {
      const d = dayDiff(p.po_date, reqDate);
      return d >= 0 && d <= window;
    })
    .sort((a, b) => (a.po_date < b.po_date ? 1 : a.po_date > b.po_date ? -1 : a.po_number < b.po_number ? 1 : -1));
  if (candidates.length > 0) {
    const p = candidates[0];
    return {
      unit_price: p.unit_price,
      basis: 'po',
      ref_po_number: p.po_number,
      note: `most recent PO ${p.po_number} on ${p.po_date} at ${p.unit_price}`,
    };
  }
  return { unit_price: item.standard_price, basis: 'standard', note: `item master standard price ${item.standard_price}` };
}
