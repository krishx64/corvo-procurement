import type { Contract, ContractLine, PolicyDoc, Supplier } from './types';

export interface ContractOption {
  contract: Contract;
  line: ContractLine;
  supplier: Supplier;
  rate: number;
}

export interface ContractSelection {
  selected?: ContractOption;
  applicable: ContractOption[];
  lowestApplicableRate?: number;
  reason: string;
}

/** Policy 4.1: contract covers item, date inside start/end inclusive, supplier Active. */
export function applicableContracts(
  itemCode: string,
  reqDate: string,
  contracts: Contract[],
  contractLines: ContractLine[],
  suppliers: Supplier[],
  policy: PolicyDoc,
): ContractOption[] {
  const day = reqDate.slice(0, 10);
  const byId = new Map(suppliers.map((s) => [s.supplier_id, s]));
  const opts: ContractOption[] = [];
  for (const clause of contractLines) {
    if (clause.item_code !== itemCode) continue;
    const contract = contracts.find((c) => c.contract_id === clause.contract_id);
    if (!contract) continue;
    if (contract.start_date.slice(0, 10) > day || contract.end_date.slice(0, 10) < day) continue;
    const supplier = byId.get(contract.supplier_id);
    if (!supplier) continue;
    if (policy.contracts.require_active_supplier && supplier.status !== 'Active') continue;
    opts.push({ contract, line: clause, supplier, rate: clause.rate });
  }
  return opts;
}

/**
 * Policy 4.2/4.3: lowest rate that still has ceiling.
 * `consumedSoFar` = contract_id -> value already committed by earlier requirements in this run.
 */
export function selectContract(
  itemCode: string,
  reqDate: string,
  quantity: number,
  contracts: Contract[],
  contractLines: ContractLine[],
  suppliers: Supplier[],
  policy: PolicyDoc,
  consumedSoFar: Map<string, number>,
): ContractSelection {
  const applicable = applicableContracts(itemCode, reqDate, contracts, contractLines, suppliers, policy);
  if (applicable.length === 0) {
    return { applicable, reason: 'no applicable contract' };
  }
  const sorted = [...applicable].sort((a, b) => a.rate - b.rate || a.contract.contract_id.localeCompare(b.contract.contract_id));
  const EPS = 1e-6;
  for (const opt of sorted) {
    const consumed = opt.contract.consumed_value + (consumedSoFar.get(opt.contract.contract_id) ?? 0);
    const wouldUse = consumed + quantity * opt.rate;
    if (wouldUse <= opt.contract.value_cap + EPS) {
      return {
        selected: opt,
        applicable,
        lowestApplicableRate: sorted[0].rate,
        reason: `contract ${opt.contract.contract_id} has ceiling: ${wouldUse.toFixed(2)} <= ${opt.contract.value_cap}`,
      };
    }
  }
  return {
    applicable,
    lowestApplicableRate: sorted[0].rate,
    reason: 'every applicable contract is out of ceiling',
  };
}
