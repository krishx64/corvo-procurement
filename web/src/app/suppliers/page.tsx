'use client';

import { useEffect, useState } from 'react';
import { api, fmtInr } from '@/lib/client';
import { Alert, Badge, btnPrimary, btnSecondary, Card, Empty, inputCls, labelCls, PageHeader, Spinner } from '@/components/ui';

interface Entry {
  supplier_id: string; status: string; po_count: number; recency: number; has_contract: boolean;
  on_time: number; quality: number; score: number; reference_price: number | null; ref_po_number?: string;
  ref_source: 'po' | 'contract' | 'none';
}
interface ItemHit { item_code: string; description: string; category: string; uom: string; score?: number }
interface Supplier { supplier_id: string; name: string; status: string; categories: string }

export default function SuppliersPage() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ItemHit[]>([]);
  const [item, setItem] = useState<ItemHit | null>(null);
  const [asOf, setAsOf] = useState('2026-11-01');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
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

  return (
    <div>
      <PageHeader
        title="Preferred suppliers"
        subtitle="Built automatically from purchase history and contracts for every item, as of any date. The ranking is our documented design — shown with its components."
        actions={
          <a className={btnSecondary} href={`/api/preferred/export?as_of=${asOf}`}>Export top 3 CSV</a>
        }
      />
      <div className="grid grid-cols-1 gap-6 px-8 py-6 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card className="p-4">
            <label className={labelCls}>Find an item</label>
            <input className={inputCls} placeholder="Search description or code…" value={query} onChange={(e) => { setQuery(e.target.value); setItem(null); }} />
            {hits.length > 0 && !item ? (
              <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {hits.map((h) => (
                  <li key={h.item_code}>
                    <button className="w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setItem(h); setQuery(`${h.description} (${h.item_code})`); load(h.item_code, asOf); }}>
                      <p className="text-sm text-slate-800">{h.description}</p>
                      <p className="text-xs text-slate-500">{h.item_code} · {h.category}</p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-4">
              <label className={labelCls}>As of date</label>
              <input type="date" className={inputCls} value={asOf} onChange={(e) => { setAsOf(e.target.value); if (item) load(item.item_code, e.target.value); }} />
            </div>
          </Card>
          <Card className="p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Ranking method</p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed">
              <li><b>Recency 35</b> — last PO ≤90 days scores 1, ≤365 days 0.5, else 0.</li>
              <li><b>Frequency 25</b> — PO count in the last 548 days, capped at 5.</li>
              <li><b>Contract 20</b> — has held a contract covering the item.</li>
              <li><b>On-time 10</b> — supplier master on-time %.</li>
              <li><b>Quality 10</b> — supplier master quality rating.</li>
            </ul>
            <p className="mt-2 text-xs text-slate-500">Active suppliers only; blocked/inactive can never be suggested. Ties break by supplier id. Validated against the three worked-example lists.</p>
          </Card>
        </div>

        <Card className="overflow-hidden">
          {busy ? <div className="p-6"><Spinner /></div> : error ? <div className="p-6"><Alert>{error}</Alert></div> : !item ? (
            <div className="p-6"><Empty title="Pick an item" hint="Search above to see its ranked preferred suppliers, reference prices and score breakdown." /></div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{item.description}</h2>
                  <p className="text-xs text-slate-500">{item.item_code} · {item.category} · as of {asOf} · policy {policyVersion}</p>
                </div>
                <Badge tone="ACTIVE">{entries.length} supplier{entries.length === 1 ? '' : 's'} on list</Badge>
              </div>
              {entries.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">No Active supplier has bought this item in the window or held a contract for it. Sourcing suggestions would use the category top-up.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-2">Rank</th><th className="px-4 py-2">Supplier</th><th className="px-4 py-2">Score</th><th className="px-4 py-2">POs</th><th className="px-4 py-2">Recency</th><th className="px-4 py-2">Contract</th><th className="px-4 py-2">On-time</th><th className="px-4 py-2">Quality</th><th className="px-4 py-2">Reference price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e, i) => (
                        <tr key={e.supplier_id} className="border-b border-slate-100">
                          <td className="px-4 py-3 font-semibold text-slate-800">{i + 1}</td>
                          <td className="px-4 py-3"><p className="font-medium text-slate-800">{nameOf(e.supplier_id)}</p><p className="text-xs text-slate-500">{e.supplier_id}</p></td>
                          <td className="px-4 py-3"><span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">{e.score.toFixed(2)}</span></td>
                          <td className="px-4 py-3">{e.po_count}</td>
                          <td className="px-4 py-3">{e.recency.toFixed(1)}</td>
                          <td className="px-4 py-3">{e.has_contract ? 'Yes' : 'No'}</td>
                          <td className="px-4 py-3">{e.on_time}%</td>
                          <td className="px-4 py-3">{e.quality}</td>
                          <td className="px-4 py-3"><span className="font-medium">{fmtInr(e.reference_price)}</span><p className="text-[11px] text-slate-500">{e.ref_source === 'po' ? `PO ${e.ref_po_number}` : e.ref_source === 'contract' ? 'contract rate' : ''}</p></td>
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
