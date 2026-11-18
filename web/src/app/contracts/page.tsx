'use client';

import { useEffect, useState } from 'react';
import { api, fmtInr } from '@/lib/client';
import { Alert, Badge, btnPrimary, btnSecondary, Card, Empty, inputCls, labelCls, PageHeader, Spinner } from '@/components/ui';

interface Contract {
  contract_id: string; supplier_id: string; start_date: string; end_date: string;
  value_cap: number; consumed_value: number; source: string; created_by: string | null;
}
interface ContractLine { contract_id: string; item_code: string; description: string | null; uom: string | null; rate: number }
interface DraftLine { item_code: string; description: string; uom: string; rate: string }

const emptyLine = (): DraftLine => ({ item_code: '', description: '', uom: 'NOS', rate: '' });

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [lines, setLines] = useState<ContractLine[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ contract_id: '', supplier_id: '', start_date: '', end_date: '', value_cap: '', consumed_value: '0' });
  const [draftLines, setDraftLines] = useState<DraftLine[]>([emptyLine()]);
  const [extractBusy, setExtractBusy] = useState(false);
  const [extractNote, setExtractNote] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    try {
      const r = await api<{ contracts: Contract[]; lines: ContractLine[] }>('/api/contracts');
      setContracts(r.contracts);
      setLines(r.lines);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load contracts');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function onPdf(file: File) {
    setExtractBusy(true);
    setExtractNote(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api<{ draft: any }>('/api/contracts/extract', { method: 'POST', body: fd });
      const d = r.draft;
      setForm({
        contract_id: d.contract_id ?? '',
        supplier_id: d.supplier_id ?? '',
        start_date: d.start_date ?? '',
        end_date: d.end_date ?? '',
        value_cap: d.value_cap != null ? String(d.value_cap) : '',
        consumed_value: '0',
      });
      setDraftLines(
        d.lines?.length
          ? d.lines.map((l: any) => ({ item_code: l.item_code, description: l.description ?? '', uom: l.uom ?? 'NOS', rate: String(l.rate) }))
          : [emptyLine()],
      );
      setShowForm(true);
      setExtractNote(`Extracted ${d.lines?.length ?? 0} line(s) from the PDF — review before saving.`);
    } catch (e) {
      setExtractNote(e instanceof Error ? e.message : 'Could not read the PDF');
    } finally {
      setExtractBusy(false);
    }
  }

  async function save() {
    setSaveError(null);
    try {
      const body = {
        contract_id: form.contract_id.trim(),
        supplier_id: form.supplier_id.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        value_cap: Number(form.value_cap),
        consumed_value: Number(form.consumed_value || 0),
        lines: draftLines.filter((l) => l.item_code.trim()).map((l) => ({ item_code: l.item_code.trim(), description: l.description, uom: l.uom, rate: Number(l.rate) })),
      };
      await api('/api/contracts', { method: 'POST', body: JSON.stringify(body) });
      setShowForm(false);
      setForm({ contract_id: '', supplier_id: '', start_date: '', end_date: '', value_cap: '', consumed_value: '0' });
      setDraftLines([emptyLine()]);
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save');
    }
  }

  const linesFor = (id: string) => lines.filter((l) => l.contract_id === id);

  return (
    <div>
      <PageHeader
        title="Rate contracts"
        subtitle="The register loads from master data. Contracts signed after the last register update exist only as signed PDFs — upload one and the app extracts it into the register."
        actions={<button className={btnPrimary} onClick={() => setShowForm((v) => !v)}>Add contract</button>}
      />
      <div className="px-8 py-6">
        {showForm ? (
          <Card className="mb-6 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Add or update a contract</h2>
              <label className={btnSecondary}>
                {extractBusy ? 'Reading PDF…' : 'Upload signed PDF to prefill'}
                <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPdf(f); }} />
              </label>
            </div>
            {extractNote ? <p className="mt-2 text-xs text-slate-500">{extractNote}</p> : null}
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div><label className={labelCls}>Contract ID</label><input className={inputCls} placeholder="RC-2026-040" value={form.contract_id} onChange={(e) => setForm({ ...form, contract_id: e.target.value })} /></div>
              <div><label className={labelCls}>Supplier ID</label><input className={inputCls} placeholder="S021" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })} /></div>
              <div><label className={labelCls}>Value ceiling (INR)</label><input className={inputCls} placeholder="2000000" value={form.value_cap} onChange={(e) => setForm({ ...form, value_cap: e.target.value })} /></div>
              <div><label className={labelCls}>Start date</label><input type="date" className={inputCls} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><label className={labelCls}>End date</label><input type="date" className={inputCls} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
              <div><label className={labelCls}>Consumed at register update</label><input className={inputCls} value={form.consumed_value} onChange={(e) => setForm({ ...form, consumed_value: e.target.value })} /></div>
            </div>
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Contract lines</p>
              <div className="space-y-2">
                {draftLines.map((l, i) => (
                  <div key={i} className="grid grid-cols-1 gap-2 md:grid-cols-[140px_1fr_80px_110px_40px]">
                    <input className={inputCls} placeholder="ITM-1036" value={l.item_code} onChange={(e) => setDraftLines(draftLines.map((x, j) => j === i ? { ...x, item_code: e.target.value } : x))} />
                    <input className={inputCls} placeholder="Description" value={l.description} onChange={(e) => setDraftLines(draftLines.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                    <input className={inputCls} placeholder="UoM" value={l.uom} onChange={(e) => setDraftLines(draftLines.map((x, j) => j === i ? { ...x, uom: e.target.value } : x))} />
                    <input className={inputCls} placeholder="Rate" value={l.rate} onChange={(e) => setDraftLines(draftLines.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))} />
                    <button className="rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" onClick={() => setDraftLines(draftLines.filter((_, j) => j !== i))}>×</button>
                  </div>
                ))}
              </div>
              <button className="mt-2 text-xs font-medium text-slate-600 hover:text-slate-900" onClick={() => setDraftLines([...draftLines, emptyLine()])}>+ Add line</button>
            </div>
            {saveError ? <div className="mt-3"><Alert>{saveError}</Alert></div> : null}
            <div className="mt-4 flex gap-2">
              <button className={btnPrimary} onClick={save}>Save contract</button>
              <button className={btnSecondary} onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </Card>
        ) : null}

        {busy ? <Spinner /> : error ? <Alert>{error}</Alert> : contracts.length === 0 ? (
          <Empty title="No contracts loaded" hint="Upload the contract register in Data & runs, or add a contract above." />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2.5">Contract</th><th className="px-4 py-2.5">Supplier</th><th className="px-4 py-2.5">Valid</th><th className="px-4 py-2.5">Ceiling used</th><th className="px-4 py-2.5">Source</th><th className="px-4 py-2.5">Lines</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const cl = linesFor(c.contract_id);
                  const pct = c.value_cap ? Math.min(100, Math.round((c.consumed_value / c.value_cap) * 100)) : 0;
                  return (
                    <>
                      <tr key={c.contract_id} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/60" onClick={() => setOpen(open === c.contract_id ? null : c.contract_id)}>
                        <td className="px-4 py-2.5 font-medium text-slate-800">{c.contract_id}</td>
                        <td className="px-4 py-2.5">{c.supplier_id}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-xs">{c.start_date} → {c.end_date}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-slate-700" style={{ width: `${pct}%` }} /></div>
                            <span className="text-xs text-slate-500">{fmtInr(c.consumed_value, 0)} / {fmtInr(c.value_cap, 0)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5"><Badge tone={c.source === 'pdf' ? 'DRAFT' : 'ACTIVE'}>{c.source === 'pdf' ? 'PDF-only' : 'Register'}</Badge></td>
                        <td className="px-4 py-2.5">{cl.length}</td>
                      </tr>
                      {open === c.contract_id ? (
                        <tr key={`${c.contract_id}-lines`} className="border-b border-slate-100 bg-slate-50/50">
                          <td colSpan={6} className="px-4 py-3">
                            <table className="w-full text-xs">
                              <thead><tr className="text-left text-slate-500"><th className="py-1 pr-4">Item</th><th className="py-1 pr-4">Description</th><th className="py-1 pr-4">UoM</th><th className="py-1">Rate</th></tr></thead>
                              <tbody>
                                {cl.map((l) => (
                                  <tr key={l.item_code} className="border-t border-slate-200/60"><td className="py-1 pr-4 font-medium">{l.item_code}</td><td className="py-1 pr-4">{l.description}</td><td className="py-1 pr-4">{l.uom}</td><td className="py-1">{fmtInr(l.rate)}</td></tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      ) : null}
                    </>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
