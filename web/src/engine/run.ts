import { dayDiff, isValidDate, isValidDateTime } from './dates';
import { clubLines, lineKey } from './club';
import { selectContract, type ContractSelection } from './contracts';
import { decideRequirement } from './decide';
import { assignPos, type PoCandidate } from './consolidate';
import { matchItem } from './match';
import { policyForDate } from './policy';
import { preferredList, suggestionsFor } from './preferred';
import { valueRequirement } from './value';
import type {
  EngineInput, EngineResult, ExportRow, Item, PolicyDoc, PrLineInput, RequirementResult, RuleContext,
} from './types';

const money = (n: number): number => Math.round(n * 100) / 100;

interface Unprocessed {
  line: PrLineInput;
  code: string;
  reason: string;
}

function latestPolicy(policies: PolicyDoc[]): PolicyDoc {
  const sorted = [...policies].sort((a, b) => (a.effective_date < b.effective_date ? -1 : a.effective_date > b.effective_date ? 1 : 0));
  return sorted[sorted.length - 1];
}

export function runEngine(input: EngineInput): EngineResult {
  const warnings: string[] = [];
  const itemsByCode = new Map(input.items.map((i) => [i.item_code, i]));
  const suppliersById = new Map(input.suppliers.map((s) => [s.supplier_id, s]));
  const plantSet = new Set(input.plants);
  const policyAt = (date: string): PolicyDoc => policyForDate(input.policies, date);
  const basePolicy = latestPolicy(input.policies);

  // 1. Validate and resolve items.
  const resolved = new Map<string, Item | undefined>();
  const valid: PrLineInput[] = [];
  const unprocessed: Unprocessed[] = [];

  for (const line of input.prLines) {
    const reasons: string[] = [];
    const givenCode = (line.item_code ?? '').trim();

    if (!plantSet.has(line.plant)) reasons.push(`plant ${line.plant} is not covered by the policy (PUN1/CHK1 only)`);
    if (!(Number.isFinite(Number(line.quantity)) && Number(line.quantity) > 0)) reasons.push('quantity missing or invalid');
    if (!isValidDateTime(line.created_at)) reasons.push('created_at missing or invalid');
    if (!isValidDate(line.need_by_date)) reasons.push('need-by date missing or invalid');

    let item: Item | undefined;
    if (reasons.length === 0) {
      const hasEstimate = line.estimated_unit_price != null && Number.isFinite(Number(line.estimated_unit_price)) && Number(line.estimated_unit_price) > 0;
      if (givenCode) {
        item = itemsByCode.get(givenCode);
        if (!item && !hasEstimate) reasons.push(`item code ${givenCode} is not in the item master and no estimated price was given`);
      } else {
        item = matchItem(line.description ?? '', input.items).item;
        if (!item && !hasEstimate) reasons.push('new item has no estimated unit price, so it cannot be valued');
      }
    }

    if (reasons.length > 0) {
      unprocessed.push({ line, code: givenCode || 'NEW', reason: reasons.join('; ') });
      continue;
    }
    resolved.set(lineKey(line), item);
    valid.push(line);
  }

  // 2. Club into requirements (windows may change mid-batch if a policy amendment applies).
  const { requirements } = clubLines(valid, resolved, basePolicy, (l) => policyAt(l.created_at));

  // 3. Value + decide in requirement-date order; consume contract ceiling as we go.
  const consumed = new Map<string, number>();
  const results: RequirementResult[] = [];
  const poCandidates: PoCandidate[] = [];
  let reqCounter = 0;

  for (const req of requirements) {
    const group_id = `REQ-${String(++reqCounter).padStart(4, '0')}`;
    const reqDate = req.first_line_at.slice(0, 10);
    const policy = policyAt(reqDate);
    const item = req.item;
    const firstLine = req.lines[0];

    let selection: ContractSelection = { applicable: [], reason: 'new item' };
    let valuationUnit: number | null = null;
    let basisNote = '';
    if (item) {
      selection = selectContract(item.item_code, reqDate, req.total_qty, input.contracts, input.contractLines, input.suppliers, policy, consumed);
      const val = valueRequirement(req.total_qty, reqDate, item, selection, input.poHistory, policy);
      valuationUnit = val.unit_price;
      basisNote = val.note;
    } else {
      valuationUnit = Number(firstLine.estimated_unit_price);
      basisNote = `valued at requester estimate ${valuationUnit}`;
    }
    const value = money(req.total_qty * (valuationUnit ?? 0));

    const boughtFromActive = item
      ? input.poHistory.some((p) => {
          if (p.item_code !== item.item_code) return false;
          const d = dayDiff(p.po_date, reqDate);
          if (d < 0 || d > policy.valuation.po_history_days) return false;
          return suppliersById.get(p.supplier_id)?.status === 'Active';
        })
      : false;

    const ctx: RuleContext = {
      item_type: item?.item_type ?? 'New',
      item_category: item?.category ?? 'New',
      plant: req.plant,
      value,
      is_emergency: req.is_emergency,
      usable_contract: !!selection.selected,
      bought_from_active_supplier: boughtFromActive,
      item_code: item?.item_code ?? 'NEW',
      uom: item?.uom ?? firstLine.uom ?? '',
      is_new_item: !item,
    };

    const decision = decideRequirement(ctx, policy);
    if (!decision) {
      warnings.push(`${group_id}: no decision rule matched`);
      unprocessed.push({ line: firstLine, code: item?.item_code ?? 'NEW', reason: `policy ${policy.version} has no rule for this requirement` });
      for (const extra of req.lines.slice(1)) unprocessed.push({ line: extra, code: item?.item_code ?? 'NEW', reason: `policy ${policy.version} has no rule for its requirement` });
      continue;
    }

    let supplierId: string | null = null;
    let poUnitPrice: number | null = null;
    let suggested: string[] = [];
    let contractId: string | null = null;
    let refPoNumber: string | null = null;
    const reason: string[] = [`Rule ${decision.rule.id}:`];

    if (decision.decision === 'PO') {
      if (decision.rule.supplier === 'contract') {
        if (!selection.selected) {
          warnings.push(`${group_id}: rule ${decision.rule.id} requires a contract but none was selected`);
          unprocessed.push({ line: firstLine, code: item!.item_code, reason: 'policy selected a contract PO but no contract has ceiling' });
          for (const extra of req.lines.slice(1)) unprocessed.push({ line: extra, code: item!.item_code, reason: 'policy selected a contract PO but no contract has ceiling' });
          continue;
        }
        supplierId = selection.selected.supplier.supplier_id;
        poUnitPrice = selection.selected.rate;
        contractId = selection.selected.contract.contract_id;
        consumed.set(contractId, (consumed.get(contractId) ?? 0) + req.total_qty * selection.selected.rate);
        reason.push(`rate contract ${contractId} @ ${poUnitPrice} (${selection.selected.supplier.name})`);
      } else {
        const pref = item
          ? preferredList(item.item_code, reqDate, input.suppliers, input.poHistory, input.contracts, input.contractLines, policy)
          : [];
        const first = pref[0];
        if (!first || first.reference_price == null) {
          warnings.push(`${group_id}: no preferred supplier with a reference price`);
          unprocessed.push({ line: firstLine, code: item?.item_code ?? 'NEW', reason: 'no preferred supplier with a reference price' });
          for (const extra of req.lines.slice(1)) unprocessed.push({ line: extra, code: item?.item_code ?? 'NEW', reason: 'no preferred supplier with a reference price' });
          continue;
        }
        supplierId = first.supplier_id;
        poUnitPrice = first.reference_price;
        refPoNumber = first.ref_po_number ?? null;
        const supplierName = suppliersById.get(first.supplier_id)?.name ?? first.supplier_id;
        reason.push(`1st preferred supplier ${supplierId} (${supplierName}) at reference price ${poUnitPrice}${refPoNumber ? ` from PO ${refPoNumber}` : ' from contract'}`);
      }
      reason.push(`; ${basisNote}`);
      poCandidates.push({
        id: group_id,
        first_line_at: req.first_line_at,
        supplier_id: supplierId!,
        plant: req.plant,
        route: decision.route,
        value: money(req.total_qty * (poUnitPrice ?? 0)),
      });
    } else {
      suggested = item
        ? suggestionsFor(item, reqDate, decision.suggest_count, input.suppliers, input.poHistory, input.contracts, input.contractLines, policy)
        : [];
      reason.push(`${decision.route}${suggested.length ? `; suggested ${suggested.join(';')}` : ''}`);
      reason.push(`; ${basisNote}`);
    }

    results.push({
      group_id,
      item_code: item?.item_code ?? 'NEW',
      item_description: item?.description ?? firstLine.description,
      plant: req.plant,
      first_line_at: req.first_line_at,
      need_by_date: req.need_by_date,
      is_emergency: req.is_emergency,
      total_qty: req.total_qty,
      unit_price: decision.decision === 'PO' ? poUnitPrice : null,
      value,
      decision: decision.decision,
      route: decision.route,
      rule_id: decision.rule.id,
      supplier_id: supplierId,
      po_id: null,
      suggested_supplier_ids: suggested,
      policy_version: policy.version,
      reason: reason.join(' '),
      contract_id: contractId,
      ref_po_number: refPoNumber,
      lines: req.lines,
      status: 'PENDING',
    });
  }

  // 4. Consolidate POs.
  const { poByReq, pos } = assignPos(poCandidates, basePolicy);
  for (const r of results) {
    if (r.decision === 'PO') r.po_id = poByReq.get(r.group_id) ?? null;
  }

  // 5. Export rows, preserving input line order.
  const byGroup = new Map(results.map((r) => [r.group_id, r]));
  const lineToGroup = new Map<string, string>();
  for (const r of results) for (const l of r.lines) lineToGroup.set(lineKey(l), r.group_id);
  const unprocessedByKey = new Map(unprocessed.map((u) => [lineKey(u.line), u]));

  const rows: ExportRow[] = input.prLines.map((line) => {
    const gid = lineToGroup.get(lineKey(line));
    if (!gid) {
      const u = unprocessedByKey.get(lineKey(line));
      return {
        pr_no: line.pr_no,
        pr_line: line.pr_line,
        resolved_item_code: u?.code ?? 'NEW',
        group_id: '',
        po_id: '',
        decision: '',
        route: 'NOT_PROCESSED',
        supplier_id: '',
        unit_price: '',
        group_value_inr: '',
        suggested_supplier_ids: '',
        policy_version: '',
        reason: u?.reason ?? 'not processed',
      };
    }
    const r = byGroup.get(gid)!;
    return {
      pr_no: line.pr_no,
      pr_line: line.pr_line,
      resolved_item_code: r.item_code,
      group_id: r.group_id,
      po_id: r.po_id ?? '',
      decision: r.decision,
      route: r.route,
      supplier_id: r.supplier_id ?? '',
      unit_price: r.unit_price != null ? r.unit_price.toFixed(2) : '',
      group_value_inr: r.value.toFixed(2),
      suggested_supplier_ids: r.suggested_supplier_ids.join(';'),
      policy_version: r.policy_version,
      reason: r.reason,
    };
  });

  return {
    requirements: results,
    rows,
    pos,
    warnings,
    policyVersionsUsed: [...new Set(results.map((r) => r.policy_version))],
  };
}
