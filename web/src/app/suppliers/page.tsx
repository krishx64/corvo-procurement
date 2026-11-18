'use client';

import { useEffect, useState } from 'react';
import { api, fmtInr } from '@/lib/client';
import { Alert, Badge, btnSecondary, Card, Empty, inputCls, labelCls, PageHeader, Spinner } from '@/components/ui';
import type { PolicyDoc } from '@/engine/types';

interface Entry {
  supplier_id: string; status: string; po_count: number; recency: number; has_contract: boolean;
  on_time: number; quality: number; score: number; reference_price: number | null; ref_po_number?: string;
  ref_source: 'po' | 'contract' | 'none';
}
interface ItemHit { item_code: string; description: string; category: string; uom: string; score?: number }
interface Supplier { supplier_id: string; name: string; status: string; categories: string }

const PART_COLORS = ['bg-[#24506b]', 'bg-[#4f7f98]', 'bg-[#8fb3c4]', 'bg-[#c6a15b]', 'bg-[#7d8a6b]'];

export default function SuppliersPage() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ItemHit[]>([]);
  const [item, setItem] = useState<ItemHit | null>(null);
  const [asOf, setAsOf] = useState('2026-11-01');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [policy, setPolicy] = useState<PolicyDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policyVersion, setPolicyVersion] = useState('');

  useEffect(() => {
    api<{ items: ItemHit[] }>(`/api/items?q=${encodeURIComponent(query)}`)
      .then((r) => setHits(r.items))
      .catch(() => setHits([]));
  }, [query]);

  useEffect(() => {
    api<{ suppliers: Supplier[] }>('/api/items').then((r) => setSuppliers(r.suppliers)).catch(() => undefined);
    api<{ active_doc: PolicyDoc | null }>('/api/policy').then((r) => setPolicy(r.active_doc)).catch(() => undefined);
  }, []);

  async function load(itemCode: string, date: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ entries: Entry[]; item: ItemHit; policy_version: string }>(`/api/preferred?item_code=${encodeURIComponent(itemCode)}&as_of=${date}`);
      setEntries(r.entries);
      setPolicyVersion(r.policy_version);
      setItem(r.item);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load');
    } finally {
      setBusy(false);
    }
  }

  const nameOf = (id: string) => suppliers.find((s) => s.supplier_id === id)?.name ?? id;
  const w = policy?.preferred_suppliers.weights ?? { recency: 35, frequency: 25, contract: 20, on_time: 10, quality: 10 };
  const cap = policy?.preferred_suppliers.frequency_cap ?? 5;

  function parts(e: Entry) {
    return [
      { label: 'Recency', value: e.recency * w.recency, className: PART_COLORS[0] },
      { label: 'Frequency', value: (Math.min(e.po_count, cap) / cap) * w.frequency, className: PART_COLORS[1] },
      { label: 'Contract', value: (e.has_contract ? 1 : 0) * w.contract, className: PART_COLORS[2] },
      { label: 'On-time', value: (e.on_time / 100) * w.on_time, className: PART_COLORS[3] },
      { label: 'Quality', value: (e.quality / 5) * w.quality, className: PART_COLORS[4] },
    ];
  }

  return (
    <div>
      <PageHeader
        title="Preferred suppliers"
        subtitle="Built automatically from purchase history and contracts for every item, as of any date. The ranking method is ours — the composition is shown for every row."
        meta={<><span>History 548 days</span><span className="text-rule-dark">/</span><span>Top 3 export</span><span className="text-rule-dark">/</span><span>Blocked & inactive excluded</span></>}
        actions={<a className={btnSecondary} href={`/api/preferred/export?as_of=${asOf}`}>Export top 3 CSV</a>}
      />
      <div className="grid grid-cols-1 gap-4 px-4 py-5 lg:grid-cols-[330px_minmax(0,1fr)] lg:px-8">
        <div className="space-y-4">
          <Card>
            <div className="border-b border-rule px-4 py-2.5"><p className="mono text-[10px] uppercase tracking-[0.1em] text-steel">Find an item</p></div>
            <div className="p-4">
              <input className={inputCls} placeholder="Description or item code…" value={query} onChange={(e) => { setQuery(e.target.value); setItem(null); }} />
              {hits.length > 0 && !item ? (
                <ul className="mt-2 max-h-72 divide-y divide-rule overflow-y-auto border border-rule">
                  {hits.map((h) => (
                    <li key={h.item_code}>
                      <button className="w-full px-3 py-2 text-left hover:bg-draftsoft/50" onClick={() => { setItem(h); setQuery(`${h.description} (${h.item_code})`); load(h.item_code, asOf); }}>
                        <p className="text-[12.5px] text-ink">{h.description}</p>
                        <p className="mono mt-0.5 text-[10px] uppercase tracking-[0.05em] text-steel">{h.item_code} · {h.category}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-4">
                <label className={labelCls}>As of date</label>
                <input type="date" className={inputCls} value={asOf} onChange={(e) => { setAsOf(e.target.value); if (item) load(item.item_code, e.target.value); }} />
              </div>
            </div>
          </Card>

          <Card>
            <div className="border-b border-rule px-4 py-2.5"><p className="mono text-[10px] uppercase tracking-[0.1em] text-steel">Scoring model</p></div>
            <div className="space-y-2.5 p-4">
              {[
                ['Recency', w.recency, '≤90d = 1 · ≤365d = 0.5 · else 0'],
                ['Frequency', w.frequency, `POs in 548d, capped at ${cap}`],
                ['Contract', w.contract, 'has held a contract for the item'],
                ['On-time', w.on_time, 'supplier master delivery %'],
                ['Quality', w.quality, 'supplier master quality 0–5'],
              ].map(([label, weight, note], i) => (
                <div key={String(label)} className="flex items-start gap-2.5">
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 ${PART_COLORS[i]}`} />
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-ink">{label} <span className="mono text-[10px] text-steel">weight {weight as number}</span></p>
                    <p className="text-[10.5px] leading-relaxed text-steel">{note}</p>
                  </div>
                </div>
              ))}
              <p className="border-t border-rule pt-2 text-[10.5px] leading-relaxed text-steel">
                Stable sort by supplier id on ties. Validated against the three published ranking examples.
              </p>
            </div>
          </Card>
        </div>

        <Card className="min-w-0 overflow-hidden">
          {busy ? <div className="p-6"><Spinner /></div> : error ? <div className="p-6"><Alert>{error}</Alert></div> : !item ? (
            <Empty title="Pick an item" hint="Search above to see the ranked preferred suppliers, reference prices and how each score is composed." />
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule px-5 py-4">
                <div>
                  <h2 className="text-[16px] font-semibold leading-tight text-ink">{item.description}</h2>
                  <p className="mono mt-1 text-[10px] uppercase tracking-[0.06em] text-steel">{item.item_code} · {item.category} · as of {asOf} · policy {policyVersion}</p>
                </div>
                <Badge tone="ACTIVE">{entries.length} supplier{entries.length === 1 ? '' : 's'}</Badge>
              </div>
              {entries.length === 0 ? (
                <div className="px-5 py-6 text-[12.5px] leading-relaxed text-steel">
                  No Active supplier has bought this item within the window or held a contract for it. RFQ/RFP suggestions would top up from the item's category instead.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="ledger">
                    <thead>
                      <tr>
                        <th className="w-10">Rank</th><th>Supplier</th><th>Score</th><th>POs</th><th>Recency</th><th>Contract</th><th>On-time</th><th>Quality</th><th>Reference price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e, i) => (
                        <tr key={e.supplier_id}>
                          <td className="mono text-[13px] font-medium text-ink">{String(i + 1).padStart(2, '0')}</td>
                          <td>
                            <p className="text-[12.5px] font-medium text-ink">{nameOf(e.supplier_id)}</p>
                            <p className="mono text-[10px] uppercase tracking-[0.05em] text-steel">{e.supplier_id}</p>
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <span className="mono text-[12px] font-medium text-ink">{e.score.toFixed(2)}</span>
                              <div className="flex h-[6px] w-24 overflow-hidden border border-rule bg-[#eceee8]">
                                {parts(e).map((p, j) => (
                                  <span key={j} title={`${p.label}: ${p.value.toFixed(1)}`} className={p.className} style={{ width: `${(p.value / 100) * 100}%` }} />
                                ))}
                              </div>
                            </div>
                          </td>
                          <td className="mono text-[12px]">{e.po_count}</td>
                          <td className="mono text-[12px]">{e.recency.toFixed(1)}</td>
                          <td className="mono text-[12px]">{e.has_contract ? 'Yes' : 'No'}</td>
                          <td className="mono text-[12px]">{e.on_time}%</td>
                          <td className="mono text-[12px]">{e.quality}</td>
                          <td>
                            <span className="mono text-[12px] font-medium text-ink">{fmtInr(e.reference_price)}</span>
                            <p className="mono text-[9.5px] uppercase tracking-[0.05em] text-steel">{e.ref_source === 'po' ? `PO ${e.ref_po_number}` : e.ref_source === 'contract' ? 'contract rate' : ''}</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
