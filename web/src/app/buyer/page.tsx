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

const FILTERS = ['ALL', 'PENDING', 'PO', 'SOURCING', 'CONTRACT_PO', 'SPOT_PO', 'EMERGENCY_PO', 'RFQ', 'RFP', 'CAPEX_SOURCING', 'NEW_ITEM_SOURCING'];

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
      const d = await api<RunDetail>(`/api/runs/${runId}`);
      setDetail(d);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Action failed');
    }
  }

  const stats = detail ? (detail.run.stats as Record<string, number>) : {};
  const pending = requirements.filter((r) => r.status === 'PENDING').length;
  const sourcing = (stats.RFQ ?? 0) + (stats.RFP ?? 0) + (stats.CAPEX_SOURCING ?? 0) + (stats.NEW_ITEM_SOURCING ?? 0);

  return (
    <div>
      <PageHeader
        title="Buyer workspace"
        subtitle="Every requirement with its decision and the clause behind it. Approve as awarded, or override with a written reason — both are recorded."
        meta={
          detail ? (
            <>
              <span>Run #{detail.run.id}</span>
              <span className="text-rule-dark">/</span>
              <span>{detail.run.batch_name}</span>
              <span className="text-rule-dark">/</span>
              <span>Policy {detail.run.policy_versions || '—'}</span>
            </>
          ) : null
        }
        actions={
          <select className={`${inputCls} w-64`} value={runId ?? ''} onChange={(e) => setRunId(Number(e.target.value))}>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>Run #{r.id} · {r.batch_name} · {new Date(r.created_at).toLocaleString()}</option>
            ))}
          </select>
        }
      />

      <div className="px-4 py-5 lg:px-8">
        {busy ? <Spinner label="Loading decisions" /> : error ? <Alert>{error}</Alert> : !detail ? (
          <Empty title="No runs yet" hint="Upload and process a PR batch in Data & runs, or raise a requisition in Request intake." />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 divide-rule border border-rule bg-panel sm:grid-cols-3 md:grid-cols-5 md:divide-x">
              {[
                ['Requirements', requirements.length],
                ['Purchase orders', detail.pos.length],
                ['Sourcing events', sourcing],
                ['Awaiting buyer', pending],
                ['Policy', detail.run.policy_versions || '—'],
              ].map(([label, value]) => (
                <div key={String(label)} className="px-4 py-3">
                  <p className="mono text-[9px] uppercase tracking-[0.1em] text-steel">{label}</p>
                  <p className="mono mt-1 text-[16px] font-medium leading-none text-ink">{value as number | string}</p>
                </div>
              ))}
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input className={`${inputCls} w-56`} placeholder="Find group, item or PR…" value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="flex flex-wrap items-center gap-1">
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`mono border px-2 py-1 text-[9.5px] uppercase tracking-[0.06em] transition ${
                      filter === f ? 'border-ink bg-ink text-paper' : 'border-rule-dark bg-panel text-steel hover:border-draft hover:text-draft'
                    }`}
                  >
                    {f === 'ALL' ? 'All' : f === 'PO' ? 'POs' : f === 'SOURCING' ? 'Sourcing' : f === 'PENDING' ? 'Pending' : routeLabel(f)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-rule px-3.5 py-2.5">
                  <span className="mono text-[10px] uppercase tracking-[0.1em] text-steel">Requirements · {filtered.length}</span>
                  <span className="mono text-[10px] uppercase tracking-[0.1em] text-steel">{pending} open</span>
                </div>
                <div className="scroll-thin max-h-[calc(100vh-22rem)] overflow-y-auto">
                  {filtered.length === 0 ? <p className="px-4 py-6 text-[12.5px] text-steel">Nothing matches this filter.</p> : (
                    <ul className="divide-y divide-rule">
                      {filtered.map((r) => (
                        <li key={r.id}>
                          <button
                            onClick={() => { setSelectedId(r.id); setOverrideOpen(false); setActionError(null); }}
                            className={`focus-ring w-full border-l-2 px-3.5 py-2.5 text-left transition ${
                              selected?.id === r.id ? 'border-draft bg-draftsoft/50' : 'border-transparent hover:border-rule-dark hover:bg-[#f5f6f1]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="mono text-[10px] tracking-[0.05em] text-steel">{r.group_id}</span>
                              <span className="mono text-[10px] text-steel">{r.status === 'PENDING' ? 'OPEN' : r.status}</span>
                            </div>
                            <p className="mt-1 truncate text-[12.5px] font-medium text-ink">{r.item_description ?? r.item_code}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <Badge tone={r.route}>{routeLabel(r.route)}</Badge>
                              <span className="mono text-[10px] text-steel">{r.plant}</span>
                              <span className="mono ml-auto text-[11px] text-graphite">{fmtInr(r.value)}</span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>

              {selected ? (
                <Card className="flex flex-col">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-5 py-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="mono text-[10px] uppercase tracking-[0.1em] text-steel">{selected.group_id}</span>
                        <Badge tone={selected.route}>{routeLabel(selected.route)}</Badge>
                        {selected.is_emergency ? <Badge tone="EMERGENCY_PO">Emergency</Badge> : null}
                        <Badge tone={selected.status}>{selected.status === 'PENDING' ? 'Open' : selected.status}</Badge>
                      </div>
                      <h2 className="mt-1.5 text-[19px] font-semibold leading-tight tracking-[-0.01em] text-ink">{selected.item_description ?? selected.item_code}</h2>
                      <p className="mono mt-1 text-[10.5px] uppercase tracking-[0.06em] text-steel">
                        {selected.item_code} · {selected.plant} · need by {selected.need_by_date} · {fmtQty(selected.total_qty)} units
                      </p>
                    </div>
                    <div className="border border-rule bg-[#f6f7f2] px-3.5 py-2 text-right">
                      <p className="mono text-[9px] uppercase tracking-[0.1em] text-steel">Requirement value</p>
                      <p className="mono mt-1 text-[18px] font-medium leading-none text-ink">{fmtInr(selected.value)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-0 border-b border-rule md:grid-cols-2 md:divide-x md:divide-rule">
                    <div className="px-5 py-4">
                      <p className="mono text-[9px] uppercase tracking-[0.1em] text-steel">Award</p>
                      {selected.decision === 'PO' ? (
                        <p className="mt-1.5 text-[13px] leading-relaxed text-ink">
                          <span className="mono font-medium">{selected.supplier_id}</span> at <span className="mono">{fmtInr(selected.unit_price)}</span> · PO <span className="mono">{selected.po_id}</span>
                        </p>
                      ) : (
                        <p className="mt-1.5 text-[13px] leading-relaxed text-ink">
                          {selected.suggested_supplier_ids ? <>Suggested suppliers · <span className="mono">{selected.suggested_supplier_ids.split(';').join(' · ')}</span></> : 'No supplier suggestions — new item, buyer to source.'}
                        </p>
                      )}
                      <p className="mono mt-2 text-[10px] uppercase tracking-[0.06em] text-steel">
                        Policy {selected.policy_version} · clause {selected.rule_id}{selected.contract_id ? ` · ${selected.contract_id}` : selected.ref_po_number ? ` · ref PO ${selected.ref_po_number}` : ''}
                      </p>
                    </div>
                    <div className="px-5 py-4">
                      <p className="mono text-[9px] uppercase tracking-[0.1em] text-steel">Policy basis</p>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-graphite">{selected.reason}</p>
                    </div>
                  </div>

                  <div className="px-5 py-4">
                    <div className="flex items-baseline justify-between">
                      <p className="mono text-[9px] uppercase tracking-[0.1em] text-steel">PR lines in this requirement</p>
                      <span className="mono text-[10px] text-steel">{selected.lines.length}</span>
                    </div>
                    <div className="mt-2 overflow-x-auto border border-rule">
                      <table className="ledger">
                        <thead>
                          <tr>
                            <th>PR</th><th>Created</th><th>Requester</th><th>Quantity</th><th>Need by</th><th>Urgency</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.lines.map((l) => (
                            <tr key={`${l.pr_no}/${l.pr_line}`}>
                              <td className="mono whitespace-nowrap text-[11px] font-medium text-ink">{l.pr_no}/{l.pr_line}</td>
                              <td className="mono whitespace-nowrap text-[11px] text-graphite">{String(l.created_at).replace('T', ' ').slice(0, 16)}</td>
                              <td className="text-[12px]">{l.requester ?? '—'}{l.department ? <span className="text-steel"> · {l.department}</span> : null}</td>
                              <td className="mono text-[11px]">{fmtQty(l.quantity)} {l.uom ?? ''}</td>
                              <td className="mono text-[11px]">{l.need_by_date}</td>
                              <td className="mono text-[11px]">{l.urgency}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {selected.status === 'OVERRIDDEN' ? (
                    <div className="mx-5 mb-4 border border-signal/40 bg-signalsoft px-3.5 py-2.5">
                      <p className="mono text-[10px] font-medium uppercase tracking-[0.08em] text-signal">
                        Overridden to {selected.override_route ? routeLabel(selected.override_route) : '—'}{selected.override_supplier_id ? ` · ${selected.override_supplier_id}` : ''}
                      </p>
                      <p className="mt-1 text-[12px] text-[#8f3518]">“{selected.override_reason}” — {selected.override_by}</p>
                    </div>
                  ) : null}

                  {actionError ? <div className="mx-5 mb-4"><Alert>{actionError}</Alert></div> : null}

                  {selected.status === 'PENDING' ? (
                    <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-rule bg-[#f7f8f3] px-5 py-3">
                      <button className={btnPrimary} onClick={() => act(selected.id, 'approve')}>
                        {selected.decision === 'PO' ? `Approve ${selected.po_id}` : `Approve ${routeLabel(selected.route)}`}
                      </button>
                      <button className={btnSecondary} onClick={() => { setOverrideOpen((v) => !v); setOverrideRoute(selected.route); setActionError(null); }}>
                        Override
                      </button>
                      <span className="mono ml-auto text-[10px] uppercase tracking-[0.08em] text-steel">Approval writes to the audit trail</span>
                    </div>
                  ) : null}

                  {overrideOpen ? (
                    <div className="border-t border-signal/30 bg-signalsoft/40 px-5 py-4">
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
                        <label className={labelCls}>Written reason — kept with the original decision</label>
                        <textarea className={inputCls} rows={2} value={overrideComment} onChange={(e) => setOverrideComment(e.target.value)} placeholder="Why are you changing the engine's decision?" />
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button className={btnPrimary} onClick={() => act(selected.id, 'override')}>Save override</button>
                        <button className={btnSecondary} onClick={() => setOverrideOpen(false)}>Cancel</button>
                      </div>
                    </div>
                  ) : null}
                </Card>
              ) : <Empty title="Select a requirement" hint="Pick a requirement to see its lines, value and the clause behind the decision." />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
