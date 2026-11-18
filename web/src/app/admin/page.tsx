'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { Alert, Badge, btnPrimary, btnSecondary, Card, Empty, inputCls, labelCls, PageHeader, Spinner } from '@/components/ui';

interface Counts { items: number; suppliers: number; po_history: number; contracts: number; contract_lines: number; policy_versions: number; batches: number; runs: number; requirements: number }
interface RunRow { id: number; batch_id: number; batch_name: string; created_at: string; created_by: string; policy_versions: string; requirement_count: number; po_count: number; stats: Record<string, number> }
interface BatchRow { id: number; name: string; source: string; created_at: string; line_count: number; last_run_id: number | null }
interface AuditRow { id: number; at: string; actor: string; role: string | null; action: string; entity: string | null; entity_id: string | null; details: any }

const UPLOADS: Array<{ type: string; label: string; hint: string }> = [
  { type: 'items', label: 'Item master', hint: 'item_code, description, uom, category, item_type, standard_price' },
  { type: 'suppliers', label: 'Supplier master', hint: 'supplier_id, name, city, categories, status, on_time_pct, quality_rating' },
  { type: 'plants', label: 'Plants', hint: 'plant, name' },
  { type: 'po_history', label: 'PO history', hint: 'po_number, po_date, supplier_id, item_code, quantity, uom, unit_price, plant, delivered_on_time' },
  { type: 'contracts', label: 'Contract register', hint: 'contract_id, supplier_id, start_date, end_date, value_cap, consumed_value' },
  { type: 'contract_lines', label: 'Contract lines', hint: 'contract_id, item_code, description, uom, rate' },
];

export default function AdminPage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [processBusy, setProcessBusy] = useState<number | null>(null);
  const [policyMode, setPolicyMode] = useState<'requirement_date' | 'latest'>('requirement_date');

  async function load() {
    try {
      const [c, r, b, a] = await Promise.all([
        api<{ counts: Counts }>('/api/admin/upload'),
        api<{ runs: RunRow[] }>('/api/runs'),
        api<{ batches: BatchRow[] }>('/api/batches'),
        api<{ audit: AuditRow[] }>('/api/audit?limit=60'),
      ]);
      setCounts(c.counts);
      setRuns(r.runs);
      setBatches(b.batches);
      setAudit(a.audit);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function upload(type: string, file: File) {
    setUploadBusy(type);
    setMessage(null);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api<{ saved: number; type: string }>(`/api/admin/upload?type=${type}`, { method: 'POST', body: fd });
      setMessage(`${r.type}: saved ${r.saved} rows.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadBusy(null);
    }
  }

  async function uploadBatch(file: File) {
    setBatchBusy(true);
    setMessage(null);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const b = await api<{ batchId: number; accepted: number; duplicates: number }>('/api/batches', { method: 'POST', body: fd });
      const p = await api<{ runId: number; requirementCount: number }>(`/api/batches/${b.batchId}/process?policy=${policyMode}`, { method: 'POST' });
      setMessage(`Batch ${b.batchId}: ${b.accepted} lines accepted${b.duplicates ? `, ${b.duplicates} duplicates skipped` : ''}. Run #${p.runId} created with ${p.requirementCount} requirements.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Batch upload failed');
    } finally {
      setBatchBusy(false);
    }
  }

  async function reprocess(batchId: number) {
    setProcessBusy(batchId);
    setMessage(null);
    setError(null);
    try {
      const p = await api<{ runId: number; requirementCount: number }>(`/api/batches/${batchId}/process?policy=${policyMode}`, { method: 'POST' });
      setMessage(`Batch ${batchId} reprocessed: run #${p.runId} with ${p.requirementCount} requirements.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reprocess failed');
    } finally {
      setProcessBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title="Data & runs" subtitle="Load master data, upload a PR batch and process it, then export decisions. Exports use the exact scoring format." />
      <div className="space-y-6 px-8 py-6">
        {message ? <Alert tone="success">{message}</Alert> : null}
        {error ? <Alert>{error}</Alert> : null}
        {busy ? <Spinner /> : null}

        {counts ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ['Items', counts.items], ['Suppliers', counts.suppliers], ['PO history', counts.po_history], ['Contracts', counts.contracts],
              ['Policy versions', counts.policy_versions], ['Batches', counts.batches], ['Runs', counts.runs], ['Requirements', counts.requirements],
            ].map(([label, value]) => (
              <Card key={String(label)} className="px-4 py-3"><p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold">{value as number}</p></Card>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900">Upload a PR batch</h2>
            <p className="mt-1 text-xs text-slate-500">CSV in the sample format: pr_no, pr_line, created_at, requester, department, plant, item_code, description, quantity, uom, estimated_unit_price, need_by_date, urgency. The batch is saved and processed immediately.</p>
            <label className={`${btnPrimary} mt-3 inline-flex cursor-pointer`}>
              {batchBusy ? 'Processing…' : 'Choose PR batch CSV'}
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBatch(f); }} />
            </label>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900">Master data</h2>
            <p className="mt-1 text-xs text-slate-500">Each upload upserts by key (PO history is replaced). Upload the six kit files once, then only PR batches per run.</p>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              {UPLOADS.map((u) => (
                <label key={u.type} className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 hover:border-slate-300 hover:bg-slate-50">
                  <span className="block text-sm font-medium text-slate-800">{u.label}</span>
                  <span className="block text-[10px] leading-tight text-slate-400">{u.hint}</span>
                  <span className="mt-1 block text-[11px] font-medium text-slate-600">{uploadBusy === u.type ? 'Uploading…' : 'Choose CSV'}</span>
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(u.type, f); }} />
                </label>
              ))}
            </div>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Runs</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Policy for processing/reprocessing</label>
              <select
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                value={policyMode}
                onChange={(e) => setPolicyMode(e.target.value as 'requirement_date' | 'latest')}
              >
                <option value="requirement_date">By requirement date (default)</option>
                <option value="latest">Latest approved version (all lines)</option>
              </select>
            </div>
          </div>
          {runs.length === 0 ? <div className="p-5"><Empty title="No runs yet" hint="Upload a PR batch above." /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-200 bg-slate-50/60 text-left text-[11px] uppercase tracking-wider text-slate-500"><th className="px-4 py-2">Run</th><th className="px-4 py-2">Batch</th><th className="px-4 py-2">Created</th><th className="px-4 py-2">Policy</th><th className="px-4 py-2">Requirements</th><th className="px-4 py-2">POs</th><th className="px-4 py-2">Actions</th></tr></thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="px-4 py-2.5 font-medium">#{r.id}</td>
                      <td className="px-4 py-2.5">{r.batch_name}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs">{String(r.created_at).slice(0, 16)}{r.created_by ? ` · ${r.created_by}` : ''}</td>
                      <td className="px-4 py-2.5">{r.policy_versions || '—'}</td>
                      <td className="px-4 py-2.5">{r.requirement_count}</td>
                      <td className="px-4 py-2.5">{r.po_count}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-2 text-xs">
                          <a className="font-medium text-slate-700 underline-offset-2 hover:underline" href={`/buyer`}>Review</a>
                          <a className="font-medium text-slate-700 underline-offset-2 hover:underline" href={`/api/runs/${r.id}/export`}>Export CSV</a>
                          <button className="font-medium text-slate-700 underline-offset-2 hover:underline disabled:opacity-50" disabled={processBusy != null} onClick={() => reprocess(r.batch_id)}>{processBusy === r.batch_id ? 'Reprocessing…' : 'Reprocess batch'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3"><h2 className="text-sm font-semibold text-slate-900">Audit trail</h2></div>
          <div className="scroll-thin max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead><tr className="sticky top-0 border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500"><th className="px-4 py-2">When</th><th className="px-4 py-2">Who</th><th className="px-4 py-2">Action</th><th className="px-4 py-2">Entity</th></tr></thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="px-4 py-1.5 whitespace-nowrap text-xs text-slate-500">{String(a.at).slice(0, 19)}</td>
                    <td className="px-4 py-1.5">{a.actor} {a.role ? <span className="text-xs text-slate-400">({a.role})</span> : null}</td>
                    <td className="px-4 py-1.5"><Badge>{a.action}</Badge></td>
                    <td className="px-4 py-1.5 text-xs text-slate-500">{a.entity} {a.entity_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
