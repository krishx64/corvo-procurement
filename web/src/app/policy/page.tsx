'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client';
import { Alert, Badge, btnPrimary, btnSecondary, Card, Empty, inputCls, labelCls, PageHeader, routeLabel, Spinner } from '@/components/ui';
import { plainPolicy, plainRule } from '@/engine/amendment';
import type { Condition, DecisionRule, PolicyDoc } from '@/engine/types';

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
  const [openRule, setOpenRule] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'assistant' | 'user'; content: string }>>([
    {
      role: 'assistant',
      content: 'Describe the policy change in your own words. I will turn it into clauses for review — nothing activates without your approval.',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

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

  function adopt(r: AmendResponse) {
    setAmend(r);
    setDraft(JSON.parse(JSON.stringify(r.proposed)));
    setRawJson(JSON.stringify(r.proposed, null, 2));
    setShowEditor(true);
    setSaved(null);
  }

  async function sendPolicyChat(text: string) {
    const message = text.trim();
    if (!message || chatBusy) {
      return;
    }
    setChatError(null);
    setChatMessages((m) => [...m, { role: 'user', content: message }]);
    setChatInput('');
    setChatBusy(true);
    try {
      const r = await api<{
        reply: string;
        proposed: PolicyDoc | null;
        changes: Array<{ target: string; plain: string }>;
        unparsed: string[];
      }>('/api/policy/chat', { method: 'POST', body: JSON.stringify({ message, base: draft ?? undefined }) });
      setChatMessages((m) => [...m, { role: 'assistant', content: r.reply }]);
      if (r.proposed) {
        setDraft(JSON.parse(JSON.stringify(r.proposed)));
        setRawJson(JSON.stringify(r.proposed, null, 2));
        setAmend(null);
        setShowEditor(true);
        setOpenRule(null);
        setSaved(null);
      }
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'Could not interpret the change');
    } finally {
      setChatBusy(false);
    }
  }

  async function readAmendment() {
    setAmendError(null);
    setAmendBusy(true);
    try {
      adopt(await api<AmendResponse>('/api/policy/amend', { method: 'POST', body: JSON.stringify({ text: amendText }) }));
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
      adopt(await api<AmendResponse>('/api/policy/amend', { method: 'POST', body: fd }));
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
      setSaved(`Policy v${r.version} is active from ${r.effective_date}. New runs apply it by requirement date.`);
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

  function updateRule(i: number, patch: Partial<DecisionRule>) {
    if (!draft) return;
    setDraft({ ...draft, decision_rules: draft.decision_rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  }
  function updateCondition(i: number, ci: number, field: string, op: string, raw: string) {
    if (!draft) return;
    setDraft({
      ...draft,
      decision_rules: draft.decision_rules.map((r, j) =>
        j === i ? { ...r, conditions: r.conditions.map((c, k) => (k === ci ? ({ field, op, value: coerceValue(field, raw) } as Condition) : c)) } : r,
      ),
    });
  }
  function removeCondition(i: number, ci: number) {
    if (!draft) return;
    setDraft({ ...draft, decision_rules: draft.decision_rules.map((r, j) => (j === i ? { ...r, conditions: r.conditions.filter((_, k) => k !== ci) } : r)) });
  }
  function addCondition(i: number) {
    if (!draft) return;
    setDraft({ ...draft, decision_rules: draft.decision_rules.map((r, j) => (j === i ? { ...r, conditions: [...r.conditions, { field: 'value' as const, op: 'lt' as const, value: 0 }] } : r)) });
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
  const phase = draft ? 2 : amend ? 1 : 1;

  return (
    <div>
      <PageHeader
        title="Procurement policy"
        subtitle="The engine reads its rules from a versioned policy document. Describe a change in chat or read an amendment, review it in plain language, then activate it from an effective date — no code change."
        meta={
          active ? (
            <>
              <span>Active v{active.version}</span>
              <span className="text-rule-dark">/</span>
              <span>Effective {active.effective_date}</span>
              <span className="text-rule-dark">/</span>
              <span>{versions.length} {versions.length === 1 ? 'version' : 'versions'}</span>
            </>
          ) : null
        }
        actions={<button className={btnSecondary} onClick={startManual} disabled={!active}>Edit current policy</button>}
      />

      <div className="px-4 py-5 lg:px-8">
        {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
        <div className="mb-4 grid grid-cols-1 divide-y divide-rule border border-rule bg-panel sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            ['Read', 'Extract the change from an amendment document.'],
            ['Review', 'Check the diff, edit rules, see the plain-language effect.'],
            ['Activate', 'Approve the version and its effective date.'],
          ].map(([title, body], i) => (
            <div key={title} className={`flex items-start gap-3 px-4 py-3 ${phase === i + 1 ? 'bg-draftsoft/40' : ''}`}>
              <span className={`mono mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border text-[11px] ${phase === i + 1 ? 'border-draft bg-draft text-paper' : 'border-rule-dark text-steel'}`}>{i + 1}</span>
              <div>
                <p className="text-[12.5px] font-medium text-ink">{title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-steel">{body}</p>
              </div>
            </div>
          ))}
        </div>

        {saved ? <div className="mb-4"><Alert tone="success">{saved}</Alert></div> : null}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card>
              <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
                <p className="mono text-[10px] uppercase tracking-[0.1em] text-steel">Step 1 · Describe a change</p>
                <span className="mono text-[9px] uppercase tracking-[0.08em] text-steel">Policy chat</span>
              </div>
              <div className="scroll-thin max-h-64 space-y-2 overflow-y-auto px-3 py-3">
                {chatMessages.map((m, i) =>
                  m.role === 'user' ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] rounded-[3px] bg-ink px-2.5 py-1.5 text-[11.5px] leading-relaxed text-paper">{m.content}</div>
                    </div>
                  ) : (
                    <div key={i} className="flex justify-start">
                      <div className="max-w-[90%] rounded-[3px] border border-rule bg-white px-2.5 py-1.5 text-[11.5px] leading-relaxed text-graphite">{m.content}</div>
                    </div>
                  ),
                )}
                {chatBusy ? <p className="mono text-[9.5px] uppercase tracking-[0.08em] text-steel">Reading the change…</p> : null}
              </div>
              {chatError ? <div className="px-3 pb-2"><Alert>{chatError}</Alert></div> : null}
              <form
                className="flex items-end gap-2 border-t border-rule p-2.5"
                onSubmit={(e) => { e.preventDefault(); sendPolicyChat(chatInput); }}
              >
                <input
                  className={inputCls}
                  placeholder="e.g. raise the spot PO limit to 3,00,000"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                />
                <button type="submit" className={btnPrimary} disabled={chatBusy || !chatInput.trim()}>Send</button>
              </form>
            </Card>

            <Card>
              <div className="border-b border-rule px-4 py-2.5">
                <p className="mono text-[10px] uppercase tracking-[0.1em] text-steel">Or read an amendment document</p>
              </div>
              <div className="p-4">
                <textarea className={`${inputCls} mono text-[12px]`} rows={6} placeholder={'e.g. In rule 5.4, replace 2,00,000 with 3,00,000.\nNew rule 5.4A: for plant CHK1, value under 6,00,000 …'} value={amendText} onChange={(e) => setAmendText(e.target.value)} />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button className={btnPrimary} onClick={readAmendment} disabled={amendBusy || !amendText.trim()}>{amendBusy ? 'Reading…' : 'Read amendment'}</button>
                  <label className={`${btnSecondary} cursor-pointer`}>
                    Upload document
                    <input type="file" accept=".pdf,.txt,.md,text/plain,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }} />
                  </label>
                </div>
                {amendError ? <div className="mt-2"><Alert>{amendError}</Alert></div> : null}
              </div>
              {amend ? (
                <div className="border-t border-rule px-4 py-3">
                  <p className="mono text-[9.5px] uppercase tracking-[0.09em] text-steel">Understood from v{amend.current_version}</p>
                  {amend.changes.length === 0 ? (
                    <p className="mt-1.5 text-[11.5px] leading-relaxed text-steel">No rule changes were understood. Use “Edit current policy” to apply the change by hand, then activate.</p>
                  ) : (
                    <ul className="mt-1.5 space-y-1.5">
                      {amend.changes.map((c, i) => (
                        <li key={i} className="border-l-2 border-success bg-successsoft/60 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-[#1f4c36]">
                          <span className="mono text-[10px] uppercase tracking-[0.05em]">{c.target}</span>
                          <span className="block">{c.plain}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {amend.unparsed.length > 0 ? (
                    <div className="mt-2 border border-amber/40 bg-ambersoft px-2.5 py-2 text-[11px] leading-relaxed text-amber">
                      <p className="mono text-[9.5px] uppercase tracking-[0.08em]">Not understood — apply manually if needed</p>
                      <ul className="mt-1 list-disc pl-4">{amend.unparsed.map((u, i) => <li key={i}>{u}</li>)}</ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>

            <Card>
              <div className="border-b border-rule px-4 py-2.5">
                <p className="mono text-[10px] uppercase tracking-[0.1em] text-steel">Version ledger</p>
              </div>
              {busy ? <div className="p-4"><Spinner /></div> : (
                <ul className="divide-y divide-rule">
                  {versions.map((v) => (
                    <li key={v.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="mono text-[12px] font-medium text-ink">v{v.version}</span>
                        <Badge tone={v.status.toUpperCase()}>{v.status}</Badge>
                      </div>
                      <p className="mono mt-1 text-[9.5px] uppercase tracking-[0.06em] text-steel">effective {v.effective_date}{v.approved_by ? ` · ${v.approved_by}` : ''}</p>
                      {v.source_note ? <p className="mt-0.5 text-[10.5px] leading-snug text-steel/90">{v.source_note}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="min-w-0">
            {!draft ? (
              <Card>
                <div className="border-b border-rule px-5 py-3">
                  <p className="mono text-[10px] uppercase tracking-[0.1em] text-steel">Current policy {active ? `v${active.version}` : ''} · plain language</p>
                </div>
                {busy ? <div className="p-5"><Spinner /></div> : !active ? <Empty title="No active policy" hint="Seed the database first." /> : (
                  <>
                    <ul className="divide-y divide-rule">
                      {plain.map((line, i) => (
                        <li key={i} className="flex gap-3 px-5 py-2.5">
                          <span className="mono mt-0.5 shrink-0 text-[10px] text-steel">{String(i + 1).padStart(2, '0')}</span>
                          <span className="text-[12.5px] leading-relaxed text-graphite">{line}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="grid grid-cols-2 gap-0 divide-rule border-t border-rule md:grid-cols-4 md:divide-x">
                      {[
                        ['Club window', `${active.clubbing.creation_window_days} days`],
                        ['Need-by window', `${active.clubbing.need_by_window_days} days`],
                        ['PO consolidation', `${active.po_consolidation.window_hours} h`],
                        ['Preferred history', `${active.preferred_suppliers.history_days} days`],
                      ].map(([label, value]) => (
                        <div key={label} className="px-4 py-2.5">
                          <p className="mono text-[9px] uppercase tracking-[0.08em] text-steel">{label}</p>
                          <p className="mono mt-0.5 text-[13px] text-ink">{value}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Card>
            ) : (
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-5 py-3">
                  <p className="mono text-[10px] uppercase tracking-[0.1em] text-steel">Step 2 · Proposed policy</p>
                  <div className="flex items-center gap-3">
                    <button className="mono text-[10px] uppercase tracking-[0.06em] text-graphite underline decoration-rule-dark underline-offset-4 hover:text-draft" onClick={() => { setRawMode((v) => !v); setRawJson(JSON.stringify(draft, null, 2)); }}>
                      {rawMode ? 'Rule editor' : 'Raw JSON'}
                    </button>
                    <button className="mono text-[10px] uppercase tracking-[0.06em] text-signal underline decoration-signal/40 underline-offset-4" onClick={() => { setDraft(null); setShowEditor(false); }}>Discard</button>
                  </div>
                </div>

                {rawMode ? (
                  <div className="p-4">
                    <textarea className={`${inputCls} mono text-[11px]`} rows={26} value={rawJson} onChange={(e) => { setRawJson(e.target.value); try { setDraft(JSON.parse(e.target.value)); } catch { /* keep text */ } }} />
                  </div>
                ) : (
                  <div className="space-y-3 p-4">
                    {sortedRules.map((r) => {
                      const i = draft.decision_rules.indexOf(r);
                      const original = active?.decision_rules.find((x) => x.id === r.id);
                      const changed = !original || JSON.stringify(original) !== JSON.stringify(r);
                      const isOpen = openRule === i;
                      return (
                        <div key={i} className={`border ${changed ? 'border-amber/50' : 'border-rule'} bg-white`}>
                          <div className="flex items-start gap-3 px-3 py-2">
                            <button className="min-w-0 flex-1 text-left" onClick={() => setOpenRule(isOpen ? null : i)}>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="mono text-[10px] font-medium uppercase tracking-[0.08em] text-steel">Clause {r.id}</span>
                                <Badge tone={r.route}>{routeLabel(r.route)}</Badge>
                                <span className="mono text-[9.5px] uppercase tracking-[0.05em] text-steel">priority {r.priority}</span>
                                {changed ? <Badge tone="DRAFT">changed</Badge> : null}
                              </div>
                              <p className="mt-1 text-[11.5px] leading-relaxed text-graphite">{plainRule(r)}</p>
                            </button>
                            <button className="mono shrink-0 text-[10px] uppercase tracking-[0.05em] text-draft hover:underline" onClick={() => setOpenRule(isOpen ? null : i)}>
                              {isOpen ? 'Close' : 'Edit'}
                            </button>
                          </div>
                          {isOpen ? (
                            <div className="border-t border-rule bg-[#f7f8f3] px-3 py-3">
                              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                                <div><p className="mono mb-0.5 text-[9px] uppercase tracking-[0.08em] text-steel">Clause</p><input className={`${inputCls} mono`} value={r.id} onChange={(e) => updateRule(i, { id: e.target.value })} /></div>
                                <div><p className="mono mb-0.5 text-[9px] uppercase tracking-[0.08em] text-steel">Priority</p><input type="number" step="0.5" className={`${inputCls} mono`} value={r.priority} onChange={(e) => updateRule(i, { priority: Number(e.target.value) })} /></div>
                                <div><p className="mono mb-0.5 text-[9px] uppercase tracking-[0.08em] text-steel">Outcome</p><select className={inputCls} value={r.outcome} onChange={(e) => updateRule(i, { outcome: e.target.value as any })}><option value="PO">PO</option><option value="SOURCING_REQUEST">Sourcing</option></select></div>
                                <div><p className="mono mb-0.5 text-[9px] uppercase tracking-[0.08em] text-steel">Route</p><select className={inputCls} value={r.route} onChange={(e) => updateRule(i, { route: e.target.value })}>{ROUTES.map((x) => <option key={x}>{x}</option>)}</select></div>
                                {r.outcome === 'SOURCING_REQUEST' ? (
                                  <div><p className="mono mb-0.5 text-[9px] uppercase tracking-[0.08em] text-steel">Suggest count</p><input type="number" className={`${inputCls} mono`} value={r.suggest_count ?? 0} onChange={(e) => updateRule(i, { suggest_count: Number(e.target.value) })} /></div>
                                ) : (
                                  <>
                                    <div><p className="mono mb-0.5 text-[9px] uppercase tracking-[0.08em] text-steel">Supplier</p><select className={inputCls} value={r.supplier ?? ''} onChange={(e) => updateRule(i, { supplier: (e.target.value || undefined) as any })}><option value="">—</option><option value="contract">contract</option><option value="first_preferred">first_preferred</option></select></div>
                                    <div><p className="mono mb-0.5 text-[9px] uppercase tracking-[0.08em] text-steel">Price</p><select className={inputCls} value={r.price ?? ''} onChange={(e) => updateRule(i, { price: (e.target.value || undefined) as any })}><option value="">—</option><option value="contract_rate">contract_rate</option><option value="reference_price">reference_price</option></select></div>
                                  </>
                                )}
                              </div>
                              <div className="mt-3">
                                <div className="flex items-baseline justify-between">
                                  <p className="mono text-[9px] uppercase tracking-[0.08em] text-steel">Conditions</p>
                                  <button className="mono text-[9.5px] uppercase tracking-[0.05em] text-draft hover:underline" onClick={() => addCondition(i)}>+ Add condition</button>
                                </div>
                                <div className="mt-1.5 space-y-1.5">
                                  {r.conditions.length === 0 ? <p className="text-[11px] text-steel">No conditions — applies to every requirement that reaches this clause.</p> : null}
                                  {r.conditions.map((c, ci) => (
                                    <div key={ci} className="grid grid-cols-[1fr_78px_1fr_28px] items-center gap-1.5">
                                      <select className={inputCls} value={c.field} onChange={(e) => updateCondition(i, ci, e.target.value, c.op, displayValue(c))}>{FIELDS.map((f) => <option key={f}>{f}</option>)}</select>
                                      <select className={inputCls} value={c.op} onChange={(e) => updateCondition(i, ci, c.field, e.target.value, displayValue(c))}>{OPS.map((o) => <option key={o}>{o}</option>)}</select>
                                      {BOOL_FIELDS.has(c.field) ? (
                                        <select className={inputCls} value={String(c.value)} onChange={(e) => updateCondition(i, ci, c.field, c.op, e.target.value)}><option value="true">true</option><option value="false">false</option></select>
                                      ) : (
                                        <input className={`${inputCls} mono`} value={displayValue(c)} onChange={(e) => updateCondition(i, ci, c.field, c.op, e.target.value)} />
                                      )}
                                      <button className="border border-rule text-steel hover:border-signal hover:text-signal" onClick={() => removeCondition(i, ci)} aria-label="Remove condition">×</button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="mt-3 flex items-center justify-between border-t border-rule pt-2">
                                <button className="mono text-[10px] uppercase tracking-[0.05em] text-signal hover:underline" onClick={() => { removeRule(i); setOpenRule(null); }}>Remove clause</button>
                                <button className="mono text-[10px] uppercase tracking-[0.05em] text-graphite hover:text-draft" onClick={() => setOpenRule(null)}>Done</button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    <button className={btnSecondary} onClick={addRule}>+ Add clause</button>
                  </div>
                )}

                {rawMode ? (
                  <div className="border-t border-rule bg-[#f7f8f3] px-4 py-3">
                    <p className="mono text-[9.5px] uppercase tracking-[0.09em] text-steel">Plain-language effect</p>
                    <ul className="mt-1.5 space-y-1">
                      {plain.map((l, i) => <li key={i} className="text-[11.5px] leading-relaxed text-graphite">· {l}</li>)}
                    </ul>
                  </div>
                ) : null}

                <div className="border-t border-rule px-4 py-4">
                  <p className="mono text-[10px] uppercase tracking-[0.1em] text-steel">Step 3 · Activate</p>
                  <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div><label className={labelCls}>New version</label><input className={`${inputCls} mono`} value={nextVersion} onChange={(e) => setNextVersion(e.target.value)} /></div>
                    <div><label className={labelCls}>Effective date</label><input type="date" className={`${inputCls} mono`} value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></div>
                    <div><label className={labelCls}>Source note</label><input className={inputCls} placeholder="Amendment source…" value={note} onChange={(e) => setNote(e.target.value)} /></div>
                  </div>
                  {saveError ? <div className="mt-3"><Alert>{saveError}</Alert></div> : null}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button className={btnPrimary} onClick={activate}>Approve &amp; activate v{nextVersion}</button>
                    <span className="text-[11px] text-steel">Decisions use the version in force on each requirement date; reprocessing can apply the latest version explicitly.</span>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
