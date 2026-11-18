'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, fmtInr, fmtQty } from '@/lib/client';
import { Alert, Badge, btnPrimary, btnSecondary, Card, Empty, inputCls, labelCls, PageHeader, routeLabel, Spinner } from '@/components/ui';

interface Line {
  pr_no: string; pr_line: number; description: string; quantity: number; uom: string | null;
  plant: string; need_by_date: string; urgency: string; created_at: string; requester: string | null;
  department: string | null; estimated_unit_price: number | null;
}
interface Requirement {
  id: number; group_id: string; item_code: string; item_description: string; plant: string;
  first_line_at: string; need_by_date: string; is_emergency: boolean; total_qty: number; unit_price: number | null;
  value: number; decision: string; route: string; rule_id: string; supplier_id: string | null; po_id: string | null;
  suggested_supplier_ids: string | null; policy_version: string; reason: string; contract_id: string | null;
  ref_po_number: string | null; status: string; override_route: string | null; override_supplier_id: string | null;
  override_reason: string | null; override_by: string | null; lines: Line[];
}
interface RunRow { id: number; batch_name: string; created_at: string; created_by: string; policy_versions: string; requirement_count: number; po_count: number; stats: Record<string, number> }
interface RunDetail { run: any; requirements: Requirement[]; pos: any[]; rows: any[] }

const ROUTE_FILTERS = ['ALL', 'PO', 'SOURCING', 'PENDING', 'CONTRACT_PO', 'SPOT_PO', 'EMERGENCY_PO', 'RFQ', 'RFP', 'CAPEX_SOURCING', 'NEW_ITEM_SOURCING'];

export default function BuyerPage() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [runId, setRunId] = useState<number | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideRoute, setOverrideRoute] = useState('SPOT_PO');
  const [overrideSupplier, setOverrideSupplier] = useState('');
  const [overrideComment, setOverrideComment] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api<{ runs: RunRow[] }>('/api/runs');
        setRuns(res.runs);
        if (res.runs.length) setRunId(res.runs[0].id);
        else setBusy(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load runs');
        setBusy(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!runId) return;
    setBusy(true);
    api<RunDetail>(`/api/runs/${runId}`)
      .then((d) => {
        setDetail(d);
        setSelectedId(d.requirements[0]?.id ?? null);
        setBusy(false);
      })
      .catch((e) => { setError(e instanceof Error ? e.message : 'Could not load run'); setBusy(false); });
  }, [runId]);

  const requirements = detail?.requirements ?? [];
  const filtered = useMemo(() => {
    return requirements.filter((r) => {
      if (filter === 'PO' && r.decision !== 'PO') return false;
      if (filter === 'SOURCING' && r.decision !== 'SOURCING_REQUEST') return false;
      if (filter === 'PENDING' && r.status !== 'PENDING') return false;
      if (!['ALL', 'PO', 'SOURCING', 'PENDING'].includes(filter) && r.route !== filter) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          r.group_id.toLowerCase().includes(q) ||
          r.item_code.toLowerCase().includes(q) ||
          (r.item_description ?? '').toLowerCase().includes(q) ||
          r.lines.some((l) => l.pr_no.toLowerCase().includes(q) || l.description.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [requirements, filter, query]);

  const selected = requirements.find((r) => r.id === selectedId) ?? filtered[0] ?? null;

  async function act(id: number, action: 'approve' | 'override') {
    setActionError(null);
    try {
      if (action === 'approve') {
        await api(`/api/requirements/${id}`, { method: 'POST' });
      } else {
        await api(`/api/requirements/${id}/override`, {
          method: 'POST',
          body: JSON.stringify({ route: overrideRoute, supplier_id: overrideRoute.includes('PO') ? overrideSupplier || undefined : undefined, comment: overrideComment }),
        });
        setOverrideOpen(false);
        setOverrideComment('');
        setOverrideSupplier('');
      }
      setRunId((x) => x);
      const d = await api<RunDetail>(`/api/runs/${runId}`);
      setDetail(d);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Action failed');
    }
  }

  const stats = detail ? (detail.run.stats as Record<string, number>) : {};
  const pending = requirements.filter((r) => r.status === 'PENDING').length;

  return (
    <div>
      <PageHeader
        title="Buyer workspace"
        subtitle="Every requirement, its decision and the clause behind it. Approve as-is or override with a written reason — both are audited."
        actions={
          <select className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={runId ?? ''} onChange={(e) => setRunId(Number(e.target.value))}>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>Run #{r.id} · {r.batch_name} · {new Date(r.created_at).toLocaleString()}</option>
            ))}
          </select>
        }
      />

      <div className="px-8 py-6">
        {busy ? <Spinner label="Loading decisions…" /> : error ? <Alert>{error}</Alert> : !detail ? (
          <Empty title="No runs yet" hint="Upload and process a PR batch in Data & runs, or create a request through chat." />
        ) : (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
              <Card className="px-4 py-3"><p className="text-[11px] uppercase tracking-wider text-slate-500">Requirements</p><p className="mt-1 text-lg font-semibold">{requirements.length}</p></Card>
              <Card className="px-4 py-3"><p className="text-[11px] uppercase tracking-wider text-slate-500">Purchase orders</p><p className="mt-1 text-lg font-semibold">{detail.pos.length}</p></Card>
              <Card className="px-4 py-3"><p className="text-[11px] uppercase tracking-wider text-slate-500">Sourcing</p><p className="mt-1 text-lg font-semibold">{(stats.RFQ ?? 0) + (stats.RFP ?? 0) + (stats.CAPEX_SOURCING ?? 0) + (stats.NEW_ITEM_SOURCING ?? 0)}</p></Card>
              <Card className="px-4 py-3"><p className="text-[11px] uppercase tracking-wider text-slate-500">Awaiting buyer</p><p className="mt-1 text-lg font-semibold">{pending}</p></Card>
              <Card className="px-4 py-3"><p className="text-[11px] uppercase tracking-wider text-slate-500">Policy</p><p className="mt-1 text-lg font-semibold">{detail.run.policy_versions || '—'}</p></Card>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" placeholder="Search group, item, PR…" value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="flex flex-wrap gap-1">
                {ROUTE_FILTERS.map((f) => (
                  <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-2.5 py-1 text-xs font-medium ${filter === f ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
                    {f === 'ALL' ? 'All' : f === 'PO' ? 'POs' : f === 'SOURCING' ? 'Sourcing' : f === 'PENDING' ? 'Pending' : routeLabel(f)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_1fr]">
              <Card className="scroll-thin max-h-[calc(100vh-20rem)] overflow-y-auto">
                {filtered.length === 0 ? <p className="p-6 text-sm text-slate-500">No requirements match this filter.</p> : (
                  <ul className="divide-y divide-slate-100">
                    {filtered.map((r) => (
                      <li key={r.id}>
                        <button onClick={() => { setSelectedId(r.id); setOverrideOpen(false); }} className={`w-full px-4 py-3 text-left transition ${selected?.id === r.id ? 'bg-slate-50' : 'hover:bg-slate-50/60'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-500">{r.group_id}</span>
                            <Badge tone={r.status}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</Badge>
                          </div>
                          <p className="mt-1 truncate text-sm font-medium text-slate-900">{r.item_description ?? r.item_code}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <Badge tone={r.route}>{routeLabel(r.route)}</Badge>
                            <span className="text-xs text-slate-500">{r.plant} · {fmtInr(r.value)}</span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {selected ? (
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{selected.group_id}</span>
                        <Badge tone={selected.route}>{routeLabel(selected.route)}</Badge>
                        {selected.is_emergency ? <Badge tone="EMERGENCY_PO">Emergency</Badge> : null}
                        <Badge tone={selected.status}>{selected.status.charAt(0) + selected.status.slice(1).toLowerCase()}</Badge>
                      </div>
                      <h2 className="mt-2 text-lg font-semibold text-slate-900">{selected.item_description ?? selected.item_code}</h2>
                      <p className="text-sm text-slate-500">{selected.item_code} · {selected.plant} · need by {selected.need_by_date}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-wider text-slate-500">Requirement value</p>
                      <p className="text-xl font-semibold text-slate-900">{fmtInr(selected.value)}</p>
                      <p className="text-xs text-slate-500">{fmtQty(selected.total_qty)} units</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Decision</p>
                      {selected.decision === 'PO' ? (
                        <p className="mt-1 text-sm text-slate-800">
                          {selected.supplier_id} at {fmtInr(selected.unit_price)} · PO <span className="font-medium">{selected.po_id}</span>
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-slate-800">
                          Sourcing request{selected.suggested_supplier_ids ? ` · suggested ${selected.suggested_supplier_ids.split(';').join(', ')}` : ' · no suggestions (new item)'}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-slate-500">Policy {selected.policy_version} · rule {selected.rule_id}{selected.contract_id ? ` · contract ${selected.contract_id}` : selected.ref_po_number ? ` · ref PO ${selected.ref_po_number}` : ''}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Why</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">{selected.reason}</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">PR lines in this requirement ({selected.lines.length})</p>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500">
                            <th className="py-1.5 pr-3">PR</th><th className="py-1.5 pr-3">Created</th><th className="py-1.5 pr-3">Requester</th><th className="py-1.5 pr-3">Qty</th><th className="py-1.5 pr-3">Need by</th><th className="py-1.5">Urgency</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.lines.map((l) => (
                            <tr key={`${l.pr_no}/${l.pr_line}`} className="border-b border-slate-100 text-slate-700">
                              <td className="py-1.5 pr-3 font-medium">{l.pr_no}/{l.pr_line}</td>
                              <td className="py-1.5 pr-3 whitespace-nowrap">{String(l.created_at).replace('T', ' ').slice(0, 16)}</td>
                              <td className="py-1.5 pr-3">{l.requester ?? '—'}{l.department ? ` · ${l.department}` : ''}</td>
                              <td className="py-1.5 pr-3">{fmtQty(l.quantity)} {l.uom ?? ''}</td>
                              <td className="py-1.5 pr-3">{l.need_by_date}</td>
                              <td className="py-1.5">{l.urgency}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {selected.status === 'OVERRIDDEN' ? (
                    <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                      <p className="font-medium">Overridden to {selected.override_route ? routeLabel(selected.override_route) : '—'}{selected.override_supplier_id ? ` · ${selected.override_supplier_id}` : ''}</p>
                      <p className="text-xs">“{selected.override_reason}” — {selected.override_by}</p>
                    </div>
                  ) : null}

                  {actionError ? <div className="mt-3"><Alert>{actionError}</Alert></div> : null}

                  {selected.status === 'PENDING' ? (
                    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
                      <button className={btnPrimary} onClick={() => act(selected.id, 'approve')}>
                        {selected.decision === 'PO' ? `Approve ${selected.po_id}` : `Approve ${routeLabel(selected.route)}`}
                      </button>
                      <button className={btnSecondary} onClick={() => { setOverrideOpen((v) => !v); setOverrideRoute(selected.route); }}>
                        Override with reason
                      </button>
                    </div>
                  ) : null}

                  {overrideOpen ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <label className={labelCls}>New route</label>
                          <select className={inputCls} value={overrideRoute} onChange={(e) => setOverrideRoute(e.target.value)}>
                            {['CONTRACT_PO', 'EMERGENCY_PO', 'SPOT_PO', 'RFQ', 'RFP', 'CAPEX_SOURCING', 'NEW_ITEM_SOURCING'].map((r) => <option key={r}>{r}</option>)}
                          </select>
                        </div>
                        {overrideRoute.includes('PO') ? (
                          <div>
                            <label className={labelCls}>Supplier</label>
                            <input className={inputCls} placeholder="e.g. S029" value={overrideSupplier} onChange={(e) => setOverrideSupplier(e.target.value)} />
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-3">
                        <label className={labelCls}>Written reason (kept with the original decision)</label>
                        <textarea className={inputCls} rows={2} value={overrideComment} onChange={(e) => setOverrideComment(e.target.value)} placeholder="Why are you changing the engine's decision?" />
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button className={btnPrimary} onClick={() => act(selected.id, 'override')}>Save override</button>
                        <button className={btnSecondary} onClick={() => setOverrideOpen(false)}>Cancel</button>
                      </div>
                    </div>
                  ) : null}
                </Card>
              ) : <Empty title="Select a requirement" hint="Pick a requirement from the list to see its lines, value and the policy clause behind it." />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
