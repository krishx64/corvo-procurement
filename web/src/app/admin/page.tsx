'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { Alert, Badge, btnPrimary, btnSecondary, Card, Empty, inputCls, PageHeader, Spinner } from '@/components/ui';

interface Counts { items: number; suppliers: number; plants: number; po_history: number; contracts: number; contract_lines: number; policy_versions: number; batches: number; runs: number; requirements: number }
interface RunRow { id: number; batch_id: number; batch_name: string; created_at: string; created_by: string; policy_versions: string; requirement_count: number; po_count: number; stats: Record<string, number> }
interface AuditRow { id: number; at: string; actor: string; role: string | null; action: string; entity: string | null; entity_id: string | null; details: any }

const UPLOADS: Array<{ type: keyof Counts; label: string; hint: string }> = [
  { type: 'items', label: 'Item master', hint: 'item_code · description · uom · category · item_type · standard_price' },
  { type: 'suppliers', label: 'Supplier master', hint: 'supplier_id · name · city · categories · status · on_time_pct · quality_rating' },
  { type: 'contracts', label: 'Contract register', hint: 'contract_id · supplier_id · start_date · end_date · value_cap · consumed_value' },
  { type: 'contract_lines', label: 'Contract lines', hint: 'contract_id · item_code · description · uom · rate' },
  { type: 'po_history', label: 'PO history', hint: 'po_number · po_date · supplier_id · item_code · quantity · uom · unit_price · plant · delivered_on_time' },
  { type: 'plants', label: 'Plants', hint: 'plant · name' },
];

export default function AdminPage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
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
      const [c, r, a] = await Promise.all([
        api<{ counts: Counts }>('/api/admin/upload'),
        api<{ runs: RunRow[] }>('/api/runs'),
        api<{ audit: AuditRow[] }>('/api/audit?limit=60'),
      ]);
      setCounts(c.counts);
      setRuns(r.runs);
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

  const loaded = (type: keyof Counts) => (counts ? counts[type] > 0 : false);
  const masterReady = counts ? counts.items > 0 && counts.suppliers > 0 && counts.po_history > 0 : false;

  return (
    <div>
      <PageHeader
        title="Data & runs"
        subtitle="Load the master data once, then process each PR batch. Exports use the exact scoring format; reprocessing applies the policy you choose."
        meta={
          counts ? (
            <>
              <span>{counts.items} items</span><span className="text-rule-dark">/</span>
              <span>{counts.suppliers} suppliers</span><span className="text-rule-dark">/</span>
              <span>{counts.po_history} PO rows</span><span className="text-rule-dark">/</span>
              <span>{counts.contracts} contracts</span><span className="text-rule-dark">/</span>
              <span>{counts.policy_versions} policy</span>
            </>
          ) : null
        }
      />
      <div className="space-y-4 px-4 py-5 lg:px-8">
        {message ? <Alert tone="success">{message}</Alert> : null}
        {error ? <Alert>{error}</Alert> : null}

        <div className="grid grid-cols-1 divide-y divide-rule border border-rule bg-panel sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            ['1', 'Master data', masterReady ? 'Loaded' : 'Waiting for uploads', masterReady],
            ['2', 'PR batch', counts && counts.batches > 0 ? `${counts.batches} batch${counts.batches === 1 ? '' : 'es'}` : 'Upload a CSV', !!counts && counts.batches > 0],
            ['3', 'Runs & export', counts && counts.runs > 0 ? `${counts.runs} runs` : 'Process a batch', !!counts && counts.runs > 0],
          ].map(([n, title, status, done]) => (
            <div key={String(title)} className="flex items-center gap-3 px-4 py-3">
              <span className={`mono flex h-6 w-6 shrink-0 items-center justify-center border text-[11px] ${done ? 'border-success bg-successsoft text-success' : 'border-rule-dark text-steel'}`}>{done ? '✓' : n}</span>
              <div>
                <p className="text-[12.5px] font-medium text-ink">{title as string}</p>
                <p className="mono mt-0.5 text-[9.5px] uppercase tracking-[0.06em] text-steel">{status as string}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card>
            <div className="border-b border-rule px-4 py-2.5">
              <p className="mono text-[10px] uppercase tracking-[0.1em] text-steel">Master data · upsert by key</p>
            </div>
            <div className="grid grid-cols-1 divide-y divide-rule md:grid-cols-2 md:divide-x md:divide-y-0">
              <div className="divide-y divide-rule">
                {UPLOADS.slice(0, 3).map((u) => (
                  <UploadRow key={u.type} label={u.label} hint={u.hint} count={counts?.[u.type]} busy={uploadBusy === u.type} onFile={(f) => upload(u.type, f)} />
                ))}
              </div>
              <div className="divide-y divide-rule">
                {UPLOADS.slice(3).map((u) => (
                  <UploadRow key={u.type} label={u.label} hint={u.hint} count={counts?.[u.type]} busy={uploadBusy === u.type} onFile={(f) => upload(u.type, f)} />
                ))}
              </div>
            </div>
          </Card>

          <Card className="flex flex-col">
            <div className="border-b border-rule px-4 py-2.5">
              <p className="mono text-[10px] uppercase tracking-[0.1em] text-steel">PR batch</p>
            </div>
            <div className="flex flex-1 flex-col p-4">
              <label className="focus-ring flex cursor-pointer flex-col items-center justify-center border border-dashed border-rule-dark bg-[#f7f8f3] px-4 py-8 text-center transition hover:border-draft hover:bg-draftsoft/30">
                <span className="mono text-[10px] uppercase tracking-[0.1em] text-draft">{batchBusy ? 'Processing…' : 'Choose PR batch CSV'}</span>
                <span className="mt-1.5 max-w-[32ch] text-[11px] leading-relaxed text-steel">Sample format: pr_no, pr_line, created_at, requester, department, plant, item_code, description, quantity, uom, estimated_unit_price, need_by_date, urgency.</span>
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBatch(f); }} />
              </label>
              <div className="mt-3">
                <label className="mono mb-1 block text-[9.5px] uppercase tracking-[0.09em] text-steel">Policy for processing / reprocessing</label>
                <select className={inputCls} value={policyMode} onChange={(e) => setPolicyMode(e.target.value as 'requirement_date' | 'latest')}>
                  <option value="requirement_date">By requirement date (default)</option>
                  <option value="latest">Latest approved version (all lines)</option>
                </select>
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-steel">Use the latest-version mode when you intentionally reprocess a batch after an amendment.</p>
              </div>
            </div>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-2.5">
            <p className="mono text-[10px] uppercase tracking-[0.1em] text-steel">Run ledger</p>
            <a className={btnSecondary} href="/buyer">Open buyer workspace</a>
          </div>
          {busy ? <div className="p-4"><Spinner /></div> : runs.length === 0 ? <Empty title="No runs yet" hint="Upload a PR batch above." /> : (
            <div className="overflow-x-auto">
              <table className="ledger">
                <thead><tr><th>Run</th><th>Batch</th><th>Created</th><th>Policy</th><th>Requirements</th><th>POs</th><th>Actions</th></tr></thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td className="mono text-[12px] font-medium text-ink">#{r.id}</td>
                      <td className="text-[12px]">{r.batch_name}</td>
                      <td className="mono whitespace-nowrap text-[10.5px] text-graphite">{String(r.created_at).replace('T', ' ').slice(0, 16)}{r.created_by ? <span className="text-steel"> · {r.created_by}</span> : null}</td>
                      <td className="mono text-[11px]">{r.policy_versions || '—'}</td>
                      <td className="mono text-[12px]">{r.requirement_count}</td>
                      <td className="mono text-[12px]">{r.po_count}</td>
                      <td>
                        <div className="mono flex flex-wrap gap-3 text-[10px] uppercase tracking-[0.05em]">
                          <a className="text-draft hover:underline" href="/buyer">Review</a>
                          <a className="text-draft hover:underline" href={`/api/runs/${r.id}/export`}>Export CSV</a>
                          <button className="text-draft hover:underline disabled:opacity-40" disabled={processBusy != null} onClick={() => reprocess(r.batch_id)}>{processBusy === r.batch_id ? 'Working…' : 'Reprocess'}</button>
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
          <div className="border-b border-rule px-4 py-2.5"><p className="mono text-[10px] uppercase tracking-[0.1em] text-steel">Audit trail</p></div>
          <div className="scroll-thin max-h-80 overflow-y-auto">
            <table className="ledger">
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th></tr></thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td className="mono whitespace-nowrap text-[10.5px] text-steel">{String(a.at).replace('T', ' ').slice(0, 19)}</td>
                    <td className="text-[12px]">{a.actor}{a.role ? <span className="mono text-[10px] text-steel"> · {a.role}</span> : null}</td>
                    <td><Badge>{a.action}</Badge></td>
                    <td className="mono text-[10.5px] text-steel">{a.entity} {a.entity_id}</td>
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

function UploadRow({ label, hint, count, busy, onFile }: { label: string; hint: string; count?: number; busy?: boolean; onFile: (f: File) => void }) {
  const ok = (count ?? 0) > 0;
  return (
    <label className="focus-ring flex cursor-pointer items-start gap-3 px-4 py-3 transition hover:bg-draftsoft/30">
      <span className={`mono mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border text-[10px] ${ok ? 'border-success bg-successsoft text-success' : 'border-rule-dark text-steel'}`}>{ok ? '✓' : '+'}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[12.5px] font-medium text-ink">{label}</span>
          <span className="mono text-[10px] uppercase tracking-[0.05em] text-steel">{busy ? 'Uploading…' : ok ? `${count?.toLocaleString('en-IN')} rows` : 'not loaded'}</span>
        </span>
        <span className="mt-0.5 block truncate text-[10px] leading-relaxed text-steel">{hint}</span>
      </span>
      <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </label>
  );
}
