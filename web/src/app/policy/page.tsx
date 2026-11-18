'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client';
import { Alert, Badge, btnPrimary, btnSecondary, Card, Empty, inputCls, labelCls, PageHeader, Spinner } from '@/components/ui';
import { plainPolicy } from '@/engine/amendment';
import type { Condition, PolicyDoc } from '@/engine/types';

interface Version { id: number; version: string; effective_date: string; status: string; source_note: string | null; created_at: string; approved_at: string | null; approved_by: string | null }
interface AmendResponse {
  current_version: string; current_plain: string[]; proposed: PolicyDoc; proposed_plain: string[];
  changes: Array<{ kind: string; target: string; before?: string; after?: string; plain: string }>;
  unparsed: string[]; text_preview: string;
}

const FIELDS = ['item_type', 'item_category', 'plant', 'value', 'is_emergency', 'usable_contract', 'bought_from_active_supplier', 'item_code', 'uom', 'is_new_item'];
const OPS = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'in'];
const ROUTES = ['CONTRACT_PO', 'EMERGENCY_PO', 'SPOT_PO', 'RFQ', 'RFP', 'CAPEX_SOURCING', 'NEW_ITEM_SOURCING'];
const BOOL_FIELDS = new Set(['is_emergency', 'usable_contract', 'bought_from_active_supplier', 'is_new_item']);

function coerceValue(field: string, raw: string): unknown {
  if (field === 'value') return Number(raw);
  if (BOOL_FIELDS.has(field)) return raw === 'true';
  if (raw.includes(',')) return raw.split(',').map((s) => s.trim()).filter(Boolean);
  return raw;
}
function displayValue(c: Condition): string {
  if (Array.isArray(c.value)) return c.value.join(',');
  return String(c.value);
}

export default function PolicyPage() {
  const [versions, setVersions] = useState<Version[]>([]);
  const [active, setActive] = useState<PolicyDoc | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [amendText, setAmendText] = useState('');
  const [amendBusy, setAmendBusy] = useState(false);
  const [amend, setAmend] = useState<AmendResponse | null>(null);
  const [amendError, setAmendError] = useState<string | null>(null);

  const [draft, setDraft] = useState<PolicyDoc | null>(null);
  const [nextVersion, setNextVersion] = useState('5.1');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' }));
  const [note, setNote] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [rawMode, setRawMode] = useState(false);
  const [rawJson, setRawJson] = useState('');
  const [showEditor, setShowEditor] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const r = await api<{ versions: Version[]; active_doc: PolicyDoc | null }>('/api/policy');
      setVersions(r.versions);
      setActive(r.active_doc);
      if (r.active_doc) {
        const [maj, min] = r.active_doc.version.split('.');
        setNextVersion(`${maj}.${Number(min ?? 0) + 1}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load policy');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function readAmendment() {
    setAmendError(null);
    setAmendBusy(true);
    try {
      const r = await api<AmendResponse>('/api/policy/amend', { method: 'POST', body: JSON.stringify({ text: amendText }) });
      setAmend(r);
      setDraft(JSON.parse(JSON.stringify(r.proposed)));
      setRawJson(JSON.stringify(r.proposed, null, 2));
      setShowEditor(true);
      setSaved(null);
    } catch (e) {
      setAmendError(e instanceof Error ? e.message : 'Could not read the amendment');
    } finally {
      setAmendBusy(false);
    }
  }

  async function readFile(file: File) {
    setAmendError(null);
    setAmendBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api<AmendResponse>('/api/policy/amend', { method: 'POST', body: fd });
      setAmend(r);
      setDraft(JSON.parse(JSON.stringify(r.proposed)));
      setRawJson(JSON.stringify(r.proposed, null, 2));
      setShowEditor(true);
      setSaved(null);
    } catch (e) {
      setAmendError(e instanceof Error ? e.message : 'Could not read the file');
    } finally {
      setAmendBusy(false);
    }
  }

  function startManual() {
    if (!active) return;
    setAmend(null);
    setDraft(JSON.parse(JSON.stringify(active)));
    setRawJson(JSON.stringify(active, null, 2));
    setShowEditor(true);
    setSaved(null);
  }

  async function activate() {
    if (!draft) return;
    setSaveError(null);
    try {
      const doc = rawMode ? (JSON.parse(rawJson) as PolicyDoc) : draft;
      const r = await api<{ id: number; version: string; effective_date: string }>('/api/policy', {
        method: 'POST',
        body: JSON.stringify({ version: nextVersion, effective_date: effectiveDate, doc, source_note: note || (amend ? 'Amendment document' : 'Manual edit'), changes: amend?.changes ?? [] }),
      });
      setSaved(`Policy v${r.version} is active from ${r.effective_date}. New runs will apply it by requirement date.`);
      setDraft(null);
      setAmend(null);
      setShowEditor(false);
      setAmendText('');
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not activate');
    }
  }

  const plain = useMemo(() => (draft ? plainPolicy(draft) : active ? plainPolicy(active) : []), [draft, active]);

  function updateRule(i: number, patch: Partial<PolicyDoc['decision_rules'][number]>) {
    if (!draft) return;
    const rules = draft.decision_rules.map((r, j) => (j === i ? { ...r, ...patch } : r));
    setDraft({ ...draft, decision_rules: rules });
  }
  function updateCondition(i: number, ci: number, field: string, op: string, raw: string) {
    if (!draft) return;
    const rules = draft.decision_rules.map((r, j) =>
      j === i ? { ...r, conditions: r.conditions.map((c, k) => (k === ci ? { field, op, value: coerceValue(field, raw) } as Condition : c)) } : r,
    );
    setDraft({ ...draft, decision_rules: rules });
  }
  function removeCondition(i: number, ci: number) {
    if (!draft) return;
    const rules = draft.decision_rules.map((r, j) => (j === i ? { ...r, conditions: r.conditions.filter((_, k) => k !== ci) } : r));
    setDraft({ ...draft, decision_rules: rules });
  }
  function addCondition(i: number) {
    if (!draft) return;
    const rules = draft.decision_rules.map((r, j) => (j === i ? { ...r, conditions: [...r.conditions, { field: 'value' as const, op: 'lt' as const, value: 0 }] } : r));
    setDraft({ ...draft, decision_rules: rules });
  }
  function addRule() {
    if (!draft) return;
    const max = Math.max(...draft.decision_rules.map((r) => r.priority), 0);
    setDraft({
      ...draft,
      decision_rules: [...draft.decision_rules, {
        id: `9.${draft.decision_rules.length}`, priority: max + 1, conditions: [], outcome: 'SOURCING_REQUEST' as const,
        route: 'RFQ', suggest_count: 3, note: 'Added manually',
      }],
    });
  }
  function removeRule(i: number) {
    if (!draft) return;
    setDraft({ ...draft, decision_rules: draft.decision_rules.filter((_, j) => j !== i) });
  }

  const sortedRules = draft ? [...draft.decision_rules].sort((a, b) => a.priority - b.priority) : [];

  return (
    <div>
      <PageHeader
        title="Procurement policy"
        subtitle="The engine reads rules from a versioned policy document. Upload an amendment or edit the rules — approve to make it active from its effective date, no code changes."
        actions={<button className={btnSecondary} onClick={startManual} disabled={!active}>Edit current policy</button>}
      />
      <div className="grid grid-cols-1 gap-6 px-8 py-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-slate-900">Read an amendment</h2>
            <p className="mt-1 text-xs text-slate-500">Paste the amendment text or upload the document (PDF/txt). The app proposes policy changes and shows what will change.</p>
            <textarea className={`${inputCls} mt-3`} rows={5} placeholder="e.g. In rule 5.4, replace ₹2,00,000 with ₹3,00,000." value={amendText} onChange={(e) => setAmendText(e.target.value)} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button className={btnPrimary} onClick={readAmendment} disabled={amendBusy || !amendText.trim()}>{amendBusy ? 'Reading…' : 'Read amendment'}</button>
              <label className={btnSecondary}>
                Upload document
                <input type="file" accept=".pdf,.txt,.md,text/plain,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }} />
              </label>
            </div>
            {amendError ? <div className="mt-2"><Alert>{amendError}</Alert></div> : null}
            {amend ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-slate-500">Detected changes from v{amend.current_version}:</p>
                {amend.changes.length === 0 ? <Alert tone="info">No rule changes were understood. Use “Edit current policy” to apply the change by hand — then approve.</Alert> : (
                  <ul className="space-y-1.5">
                    {amend.changes.map((c, i) => (
                      <li key={i} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                        <span className="font-semibold">{c.target}</span> — {c.plain}
                      </li>
                    ))}
                  </ul>
                )}
                {amend.unparsed.length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <p className="font-semibold">Not understood — apply manually if needed:</p>
                    <ul className="mt-1 list-disc pl-4">{amend.unparsed.map((u, i) => <li key={i}>{u}</li>)}</ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold text-slate-900">Versions</h2>
            {busy ? <div className="mt-3"><Spinner /></div> : (
              <ul className="mt-3 space-y-2">
                {versions.map((v) => (
                  <li key={v.id} className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900">v{v.version}</span>
                      <Badge tone={v.status.toUpperCase()}>{v.status}</Badge>
                    </div>
                    <p className="text-xs text-slate-500">effective {v.effective_date}{v.approved_by ? ` · approved by ${v.approved_by}` : ''}</p>
                    {v.source_note ? <p className="mt-1 text-[11px] text-slate-400">{v.source_note}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {saved ? <Alert tone="success">{saved}</Alert> : null}
          {!draft ? (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-900">Current policy {active ? `v${active.version}` : ''} in plain language</h2>
              {busy ? <div className="mt-3"><Spinner /></div> : !active ? <div className="mt-3"><Empty title="No active policy" hint="Seed the database (or upload a policy JSON) to get started." /></div> : (
                <>
                  <ul className="mt-3 space-y-2">{plain.map((line, i) => <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{line}</li>)}</ul>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500 md:grid-cols-4">
                    <div className="rounded-lg border border-slate-200 p-2">Club window<br /><b className="text-slate-800">{active.clubbing.creation_window_days} days</b></div>
                    <div className="rounded-lg border border-slate-200 p-2">Need-by window<br /><b className="text-slate-800">{active.clubbing.need_by_window_days} days</b></div>
                    <div className="rounded-lg border border-slate-200 p-2">PO consolidation<br /><b className="text-slate-800">{active.po_consolidation.window_hours} h</b></div>
                    <div className="rounded-lg border border-slate-200 p-2">Preferred history<br /><b className="text-slate-800">{active.preferred_suppliers.history_days} days</b></div>
                  </div>
                </>
              )}
            </Card>
          ) : (
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Proposed policy — review &amp; approve</h2>
                <div className="flex items-center gap-2">
                  <button className="text-xs font-medium text-slate-600 hover:text-slate-900" onClick={() => { setRawMode((v) => !v); setRawJson(JSON.stringify(draft, null, 2)); }}>{rawMode ? 'Rule editor' : 'Raw JSON'}</button>
                  <button className="text-xs font-medium text-slate-600 hover:text-slate-900" onClick={() => { setDraft(null); setShowEditor(false); }}>Discard</button>
                </div>
              </div>

              {rawMode ? (
                <textarea className={`${inputCls} mt-3 font-mono text-xs`} rows={22} value={rawJson} onChange={(e) => { setRawJson(e.target.value); try { setDraft(JSON.parse(e.target.value)); } catch { /* keep text */ } }} />
              ) : (
                <div className="mt-4 space-y-3">
                  {sortedRules.map((r) => {
                    const i = draft.decision_rules.indexOf(r);
                    return (
                      <div key={i} className="rounded-xl border border-slate-200 p-3">
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                          <div><label className={labelCls}>Rule</label><input className={inputCls} value={r.id} onChange={(e) => updateRule(i, { id: e.target.value })} /></div>
                          <div><label className={labelCls}>Priority</label><input type="number" step="0.5" className={inputCls} value={r.priority} onChange={(e) => updateRule(i, { priority: Number(e.target.value) })} /></div>
                          <div><label className={labelCls}>Outcome</label><select className={inputCls} value={r.outcome} onChange={(e) => updateRule(i, { outcome: e.target.value as any })}><option value="PO">PO</option><option value="SOURCING_REQUEST">Sourcing</option></select></div>
                          <div className="md:col-span-2"><label className={labelCls}>Route</label><select className={inputCls} value={r.route} onChange={(e) => updateRule(i, { route: e.target.value })}>{ROUTES.map((x) => <option key={x}>{x}</option>)}</select></div>
                          <div><label className={labelCls}>Suggest #</label><input type="number" className={inputCls} value={r.suggest_count ?? 0} onChange={(e) => updateRule(i, { suggest_count: Number(e.target.value) })} /></div>
                        </div>
                        {r.outcome === 'PO' ? (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <div><label className={labelCls}>Supplier</label><select className={inputCls} value={r.supplier ?? ''} onChange={(e) => updateRule(i, { supplier: (e.target.value || undefined) as any })}><option value="">—</option><option value="contract">contract</option><option value="first_preferred">first_preferred</option></select></div>
                            <div><label className={labelCls}>Price</label><select className={inputCls} value={r.price ?? ''} onChange={(e) => updateRule(i, { price: (e.target.value || undefined) as any })}><option value="">—</option><option value="contract_rate">contract_rate</option><option value="reference_price">reference_price</option></select></div>
                          </div>
                        ) : null}
                        <div className="mt-3">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Conditions</p>
                          <div className="space-y-1.5">
                            {r.conditions.map((c, ci) => (
                              <div key={ci} className="grid grid-cols-[1fr_90px_1fr_32px] items-center gap-1.5">
                                <select className={inputCls} value={c.field} onChange={(e) => updateCondition(i, ci, e.target.value, c.op, displayValue(c))}>{FIELDS.map((f) => <option key={f}>{f}</option>)}</select>
                                <select className={inputCls} value={c.op} onChange={(e) => updateCondition(i, ci, c.field, e.target.value, displayValue(c))}>{OPS.map((o) => <option key={o}>{o}</option>)}</select>
                                {BOOL_FIELDS.has(c.field) ? (
                                  <select className={inputCls} value={String(c.value)} onChange={(e) => updateCondition(i, ci, c.field, c.op, e.target.value)}><option value="true">true</option><option value="false">false</option></select>
                                ) : (
                                  <input className={inputCls} value={displayValue(c)} onChange={(e) => updateCondition(i, ci, c.field, c.op, e.target.value)} />
                                )}
                                <button className="rounded-lg border border-slate-200 px-2 py-1 text-slate-500 hover:bg-slate-50" onClick={() => removeCondition(i, ci)}>×</button>
                              </div>
                            ))}
                          </div>
                          <div className="mt-1.5 flex items-center gap-3">
                            <button className="text-xs font-medium text-slate-600 hover:text-slate-900" onClick={() => addCondition(i)}>+ Condition</button>
                            <button className="text-xs font-medium text-rose-600 hover:text-rose-700" onClick={() => removeRule(i)}>Remove rule</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <button className={btnSecondary} onClick={addRule}>+ Add rule</button>
                </div>
              )}

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Plain-language preview</p>
                <ul className="mt-1 space-y-1 text-xs text-slate-600">{plain.map((l, i) => <li key={i}>• {l}</li>)}</ul>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div><label className={labelCls}>New version</label><input className={inputCls} value={nextVersion} onChange={(e) => setNextVersion(e.target.value)} /></div>
                <div><label className={labelCls}>Effective date</label><input type="date" className={inputCls} value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></div>
                <div><label className={labelCls}>Note</label><input className={inputCls} placeholder="Amendment source…" value={note} onChange={(e) => setNote(e.target.value)} /></div>
              </div>
              {saveError ? <div className="mt-3"><Alert>{saveError}</Alert></div> : null}
              <div className="mt-4 flex items-center gap-2">
                <button className={btnPrimary} onClick={activate}>Approve &amp; activate v{nextVersion}</button>
                <span className="text-xs text-slate-500">Decisions use the version in force on each requirement date.</span>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
