'use client';

import { Fragment, useEffect, useState } from 'react';
import { api, fmtInr } from '@/lib/client';
import { Alert, Badge, btnPrimary, btnSecondary, Card, Empty, inputCls, labelCls, PageHeader, Spinner } from '@/components/ui';

interface Contract {
  contract_id: string; supplier_id: string; start_date: string; end_date: string;
  value_cap: number; consumed_value: number; source: string; created_by: string | null;
}
interface ContractLine { contract_id: string; item_code: string; description: string | null; uom: string | null; rate: number }
interface DraftLine { item_code: string; description: string; uom: string; rate: string }

const emptyLine = (): DraftLine => ({ item_code: '', description: '', uom: 'NOS', rate: '' });
const todayIst = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [lines, setLines] = useState<ContractLine[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ contract_id: '', supplier_id: '', start_date: todayIst(), end_date: '', value_cap: '', consumed_value: '0' });
  const [draftLines, setDraftLines] = useState<DraftLine[]>([emptyLine()]);
  const [extractBusy, setExtractBusy] = useState(false);
  const [extractNote, setExtractNote] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
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
        start_date: d.start_date ?? todayIst(),
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
      setExtractNote({ tone: 'info', text: `Extracted ${d.lines?.length ?? 0} line(s) from the signed PDF. Review the values before saving.` });
    } catch (e) {
      setExtractNote({ tone: 'error', text: e instanceof Error ? e.message : 'Could not read the PDF' });
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
      setForm({ contract_id: '', supplier_id: '', start_date: todayIst(), end_date: '', value_cap: '', consumed_value: '0' });
      setDraftLines([emptyLine()]);
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save');
    }
  }

  const linesFor = (id: string) => lines.filter((l) => l.contract_id === id);
  const pdfOnly = contracts.filter((c) => c.source === 'pdf').length;

  return (
    <div>
      <PageHeader
        title="Rate contracts"
        subtitle="The register as at 31 October. Contracts signed after that update exist only as signed PDFs — upload one and the app extracts the term, ceiling and rates for review."
        meta={<><span>{contracts.length} contracts</span><span className="text-rule-dark">/</span><span>{pdfOnly} added from PDF</span><span className="text-rule-dark">/</span><span>Ceiling checks run by requirement date</span></>}
        actions={<button className={btnPrimary} onClick={() => { setShowForm((v) => !v); setExtractNote(null); }}>{showForm ? 'Close form' : 'Add contract'}</button>}
      />
      <div className="px-4 py-5 lg:px-8">
        {showForm ? (
          <Card className="mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-3">
              <h2 className="text-[13px] font-semibold text-ink">Add or update a contract</h2>
              <label className={`${btnSecondary} cursor-pointer`}>
                {extractBusy ? 'Reading PDF…' : 'Extract from signed PDF'}
                <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPdf(f); }} />
              </label>
            </div>
            {extractNote ? (
              <div className="px-5 pt-3">
                <Alert tone={extractNote.tone === 'error' ? 'error' : 'info'}>{extractNote.text}</Alert>
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-3">
              <div><label className={labelCls}>Contract ID</label><input className={`${inputCls} mono`} placeholder="RC-2026-040" value={form.contract_id} onChange={(e) => setForm({ ...form, contract_id: e.target.value })} /></div>
              <div><label className={labelCls}>Supplier</label><input className={`${inputCls} mono`} placeholder="S021" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })} /></div>
              <div><label className={labelCls}>Value ceiling (INR)</label><input className={`${inputCls} mono`} placeholder="2000000" value={form.value_cap} onChange={(e) => setForm({ ...form, value_cap: e.target.value })} /></div>
              <div><label className={labelCls}>Start date</label><input type="date" className={`${inputCls} mono`} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><label className={labelCls}>End date</label><input type="date" className={`${inputCls} mono`} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
              <div><label className={labelCls}>Consumed at register update</label><input className={`${inputCls} mono`} value={form.consumed_value} onChange={(e) => setForm({ ...form, consumed_value: e.target.value })} /></div>
            </div>
            <div className="border-t border-rule px-5 py-4">
              <div className="flex items-baseline justify-between">
                <p className="mono text-[10px] uppercase tracking-[0.09em] text-steel">Contract lines</p>
                <button className="mono text-[10px] uppercase tracking-[0.06em] text-draft hover:underline" onClick={() => setDraftLines([...draftLines, emptyLine()])}>+ Add line</button>
              </div>
              <div className="mt-2 space-y-2">
                {draftLines.map((l, i) => (
                  <div key={i} className="grid grid-cols-1 gap-2 md:grid-cols-[130px_1fr_78px_110px_34px]">
                    <input className={`${inputCls} mono`} placeholder="ITM-1036" value={l.item_code} onChange={(e) => setDraftLines(draftLines.map((x, j) => j === i ? { ...x, item_code: e.target.value } : x))} />
                    <input className={inputCls} placeholder="Description" value={l.description} onChange={(e) => setDraftLines(draftLines.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                    <input className={`${inputCls} mono`} placeholder="UoM" value={l.uom} onChange={(e) => setDraftLines(draftLines.map((x, j) => j === i ? { ...x, uom: e.target.value } : x))} />
                    <input className={`${inputCls} mono`} placeholder="Rate" value={l.rate} onChange={(e) => setDraftLines(draftLines.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))} />
                    <button className="border border-rule text-steel hover:border-signal hover:text-signal" onClick={() => setDraftLines(draftLines.filter((_, j) => j !== i))} aria-label="Remove line">×</button>
                  </div>
                ))}
              </div>
            </div>
            {saveError ? <div className="px-5 pb-3"><Alert>{saveError}</Alert></div> : null}
            <div className="flex items-center gap-2 border-t border-rule bg-[#f7f8f3] px-5 py-3">
              <button className={btnPrimary} onClick={save}>Save contract</button>
              <button className={btnSecondary} onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </Card>
        ) : null}

        {busy ? <Spinner /> : error ? <Alert>{error}</Alert> : contracts.length === 0 ? (
          <Empty title="No contracts loaded" hint="Upload the contract register in Data & runs, or add a contract above." />
        ) : (
          <Card className="overflow-hidden">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Contract</th><th>Supplier</th><th>Term</th><th className="w-56">Ceiling used</th><th>Source</th><th>Lines</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const cl = linesFor(c.contract_id);
                  const pct = c.value_cap ? Math.min(100, Math.round((c.consumed_value / c.value_cap) * 100)) : 0;
                  return (
                    <Fragment key={c.contract_id}>
                      <tr className="cursor-pointer" onClick={() => setOpen(open === c.contract_id ? null : c.contract_id)}>
                        <td className="mono text-[12px] font-medium text-ink">{c.contract_id}</td>
                        <td className="mono text-[12px]">{c.supplier_id}</td>
                        <td className="mono whitespace-nowrap text-[11px] text-graphite">{c.start_date} → {c.end_date}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="h-[6px] w-24 shrink-0 overflow-hidden border border-rule bg-[#eceee8]">
                              <div className={`h-full ${pct >= 95 ? 'bg-signal' : pct >= 80 ? 'bg-[#c6a15b]' : 'bg-draft'}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="mono whitespace-nowrap text-[10px] text-steel">{fmtInr(c.consumed_value, 0)} / {fmtInr(c.value_cap, 0)}</span>
                          </div>
                        </td>
                        <td><Badge tone={c.source === 'pdf' ? 'DRAFT' : 'ACTIVE'}>{c.source === 'pdf' ? 'PDF only' : 'Register'}</Badge></td>
                        <td className="mono text-[12px]">{cl.length}</td>
                      </tr>
                      {open === c.contract_id ? (
                        <tr>
                          <td colSpan={6} className="bg-[#f6f7f2] p-0">
                            <table className="w-full text-[11.5px]">
                              <thead><tr className="border-b border-rule text-left"><th className="mono px-5 py-1.5 text-[9px] uppercase tracking-[0.08em] text-steel">Item</th><th className="mono py-1.5 text-[9px] uppercase tracking-[0.08em] text-steel">Description</th><th className="mono py-1.5 text-[9px] uppercase tracking-[0.08em] text-steel">UoM</th><th className="mono py-1.5 text-[9px] uppercase tracking-[0.08em] text-steel">Rate</th></tr></thead>
                              <tbody>
                                {cl.map((l) => (
                                  <tr key={l.item_code} className="border-b border-rule/70 last:border-0">
                                    <td className="mono px-5 py-1.5">{l.item_code}</td>
                                    <td className="py-1.5">{l.description}</td>
                                    <td className="mono py-1.5">{l.uom}</td>
                                    <td className="mono py-1.5">{fmtInr(l.rate)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
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
