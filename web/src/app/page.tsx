'use client';

import { useEffect, useRef, useState } from 'react';
import { api, fmtInr, fmtQty } from '@/lib/client';
import { Alert, Badge, btnPrimary, btnSecondary, Card, PageHeader, routeLabel, Spinner } from '@/components/ui';

interface Msg { role: 'assistant' | 'user'; content: string }
interface Candidate { item_code: string; description: string; score: number }
interface ChatResponse {
  reply: string;
  draft: any;
  ready: boolean;
  candidates?: Candidate[];
  missing?: string[];
  quickReplies?: string[];
}
interface ConfirmResponse {
  pr_no: string;
  run_id: number;
  decision: { route: string; group_id: string; po_id: string; supplier_id: string; unit_price: number; group_value_inr: number; suggested_supplier_ids: string; policy_version: string; reason: string; decision: string };
}

const EXAMPLES = [
  'Need 200 nitrile gloves for Chakan by next Friday',
  '50 safety helmets for Bhosari, urgent',
  'Drinking water purifier 50 LPH for Pune plant',
];

function Wing({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 24" className={className} aria-hidden="true">
      <path d="M2 22 L12 4 L16.5 4 L9 17 Z" fill="currentColor" />
      <path d="M11 22 L20 6.5 L24.5 6.5 L16.5 20 Z" fill="currentColor" opacity=".7" />
      <path d="M20 22 L28 9 L33 9 L25.5 22 Z" fill="currentColor" opacity=".45" />
    </svg>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: 'What do you need to buy? Describe it the way you would tell a colleague — I will match the item, ask for anything missing, and raise the requisition.' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [result, setResult] = useState<ConfirmResponse | null>(null);
  const [policyVersion, setPolicyVersion] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ active_doc: { version: string } | null }>('/api/policy')
      .then((r) => setPolicyVersion(r.active_doc?.version ?? ''))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, ready, result]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError(null);
    const next = [...messages, { role: 'user' as const, content: trimmed }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const res = await api<ChatResponse>('/api/chat', { method: 'POST', body: JSON.stringify({ messages: next }) });
      setMessages((m) => [...m, { role: 'assistant', content: res.reply }]);
      setDraft(res.draft);
      setReady(res.ready);
      setCandidates(res.candidates ?? []);
      setQuickReplies(res.quickReplies ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat failed');
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<ConfirmResponse>('/api/chat/confirm', { method: 'POST', body: JSON.stringify({ draft }) });
      setResult(res);
      setReady(false);
      setQuickReplies([]);
      setMessages((m) => [...m, { role: 'assistant', content: `Requisition ${res.pr_no} is raised. The policy decision is attached below and queued for the buyer.` }]);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the PR');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setMessages([{ role: 'assistant', content: 'What do you need to buy? Describe it the way you would tell a colleague — I will match the item, ask for anything missing, and raise the requisition.' }]);
    setDraft(null);
    setReady(false);
    setCandidates([]);
    setQuickReplies([]);
    setResult(null);
    setError(null);
  }

  return (
    <div>
      <PageHeader
        title="Request intake"
        subtitle="Raise a purchase requisition in plain language. Item matching, clubbing and the policy decision happen the moment you confirm."
        meta={
          <>
            {policyVersion ? <span>Policy v{policyVersion}</span> : <span>Policy loading</span>}
            <span className="text-rule-dark">/</span>
            <span>PUN1 · CHK1</span>
            <span className="text-rule-dark">/</span>
            <span>Decisions are live</span>
          </>
        }
        actions={<button className={btnSecondary} onClick={reset}>New session</button>}
      />

      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_296px] lg:px-8">
        <Card className="flex h-[calc(100vh-12.5rem)] min-h-[560px] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
            <span className="mono text-[10px] uppercase tracking-[0.1em] text-steel">Requisition desk</span>
            <span className="mono text-[10px] uppercase tracking-[0.1em] text-steel">
              {messages.filter((m) => m.role === 'user').length} {messages.filter((m) => m.role === 'user').length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          <div ref={scrollRef} className="scroll-thin flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[78%] whitespace-pre-line rounded-[3px] bg-ink px-3.5 py-2.5 text-[13px] leading-relaxed text-paper">{m.content}</div>
                </div>
              ) : (
                <div key={i} className="flex items-start gap-3">
                  <Wing className="mt-1 h-5 w-8 shrink-0 text-draft" />
                  <div className="max-w-[80%] whitespace-pre-line rounded-[3px] border border-rule bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-graphite">{m.content}</div>
                </div>
              ),
            )}

            {ready && draft ? (
              <div className="border border-draft/40 bg-draftsoft/60">
                <div className="flex items-center justify-between border-b border-draft/25 px-3.5 py-2">
                  <span className="mono text-[10px] font-medium uppercase tracking-[0.1em] text-draft">Requisition slip — check before raising</span>
                  <span className="mono text-[10px] uppercase tracking-[0.1em] text-draft/70">{draft.urgency === 'Emergency' ? 'Emergency' : 'Normal'}</span>
                </div>
                <div className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-1.5 px-3.5 py-3 text-[12.5px]">
                  <span className="mono text-[10px] uppercase tracking-[0.08em] text-steel">Item</span>
                  <span className="text-ink">{draft.item_code ? `${draft.item_description} · ${draft.item_code}` : `${draft.item_description ?? draft.item_query} · new item, sourcing`}</span>
                  <span className="mono text-[10px] uppercase tracking-[0.08em] text-steel">Quantity</span>
                  <span className="mono text-ink">{fmtQty(draft.quantity)} {draft.uom ?? ''}</span>
                  <span className="mono text-[10px] uppercase tracking-[0.08em] text-steel">Plant</span>
                  <span className="text-ink">{draft.plant === 'PUN1' ? 'PUN1 — Bhosari' : draft.plant === 'CHK1' ? 'CHK1 — Chakan' : draft.plant}</span>
                  <span className="mono text-[10px] uppercase tracking-[0.08em] text-steel">Need by</span>
                  <span className="mono text-ink">{draft.need_by_date}</span>
                  {draft.is_new_item ? (
                    <>
                      <span className="mono text-[10px] uppercase tracking-[0.08em] text-steel">Est. price</span>
                      <span className="mono text-ink">{fmtInr(draft.estimated_unit_price)}</span>
                    </>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 border-t border-draft/25 px-3.5 py-2.5">
                  <button className={btnPrimary} onClick={confirm} disabled={busy}>Raise requisition</button>
                  <button className={btnSecondary} onClick={() => send('Change the details')}>Amend</button>
                </div>
              </div>
            ) : null}

            {result ? (
              <div className="border border-rule bg-white">
                <div className="flex flex-wrap items-center gap-2 border-b border-rule px-3.5 py-2.5">
                  <span className="mono text-[12px] font-semibold text-ink">{result.pr_no}</span>
                  <Badge tone={result.decision.route}>{routeLabel(result.decision.route)}</Badge>
                  <Badge tone="PENDING">Awaiting buyer</Badge>
                  <span className="mono ml-auto text-[10px] uppercase tracking-[0.08em] text-steel">Policy {result.decision.policy_version}</span>
                </div>
                <div className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-1.5 px-3.5 py-3 text-[12.5px]">
                  <span className="mono text-[10px] uppercase tracking-[0.08em] text-steel">Requirement</span>
                  <span className="mono text-ink">{result.decision.group_id}</span>
                  <span className="mono text-[10px] uppercase tracking-[0.08em] text-steel">Value</span>
                  <span className="mono text-ink">{fmtInr(result.decision.group_value_inr)}</span>
                  {result.decision.supplier_id ? (
                    <>
                      <span className="mono text-[10px] uppercase tracking-[0.08em] text-steel">Supplier</span>
                      <span className="mono text-ink">{result.decision.supplier_id} @ {fmtInr(result.decision.unit_price)}</span>
                    </>
                  ) : null}
                  {result.decision.suggested_supplier_ids ? (
                    <>
                      <span className="mono text-[10px] uppercase tracking-[0.08em] text-steel">Suggested</span>
                      <span className="mono text-ink">{result.decision.suggested_supplier_ids.split(';').join(' · ')}</span>
                    </>
                  ) : null}
                  {result.decision.po_id ? (
                    <>
                      <span className="mono text-[10px] uppercase tracking-[0.08em] text-steel">PO</span>
                      <span className="mono text-ink">{result.decision.po_id}</span>
                    </>
                  ) : null}
                </div>
                <div className="border-t border-rule bg-[#f6f7f2] px-3.5 py-2.5">
                  <p className="mono text-[10px] uppercase tracking-[0.08em] text-steel">Clause applied</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-graphite">{result.decision.reason}</p>
                </div>
                <div className="flex items-center gap-3 border-t border-rule px-3.5 py-2.5">
                  <a className={btnGhostLink} href="/buyer">Open in buyer workspace</a>
                  <button className={btnGhostLink} onClick={reset}>Raise another</button>
                </div>
              </div>
            ) : null}

            {busy ? <Spinner label="Reading the request" /> : null}
            {error ? <Alert>{error}</Alert> : null}
          </div>

          <div className="border-t border-rule bg-[#f7f8f3] p-3">
            {candidates.length > 0 ? (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="mono text-[9.5px] uppercase tracking-[0.08em] text-steel">Possible matches</span>
                {candidates.map((c) => (
                  <button key={c.item_code} className="focus-ring rounded-[3px] border border-rule-dark bg-white px-2 py-1 text-[11px] text-graphite hover:border-draft hover:text-draft" onClick={() => send(c.item_code)}>
                    {c.description} <span className="mono text-steel">· {c.item_code}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {quickReplies.length > 0 ? (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="mono text-[9.5px] uppercase tracking-[0.08em] text-steel">Answer</span>
                {quickReplies.map((q) => (
                  <button
                    key={q}
                    className={`focus-ring rounded-[3px] border px-2.5 py-1 text-[11px] font-medium ${q === 'Urgent' ? 'border-signal/50 bg-signalsoft text-signal hover:border-signal' : 'border-rule-dark bg-white text-graphite hover:border-draft hover:text-draft'}`}
                    onClick={() => send(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            ) : null}
            <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                rows={2}
                placeholder="e.g. need 200 nitrile gloves for Chakan by next Friday"
                className="focus-ring min-h-[44px] flex-1 resize-none rounded-[3px] border border-rule-dark bg-white px-3 py-2 text-[13px] placeholder:text-steel/70 focus:border-draft focus:outline-none"
              />
              <button type="submit" className={btnPrimary} disabled={busy || !input.trim()}>Log request</button>
            </form>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="border-b border-rule px-4 py-2.5">
              <p className="mono text-[10px] uppercase tracking-[0.1em] text-steel">Intake protocol</p>
            </div>
            <ol className="divide-y divide-rule">
              {[
                ['Describe', 'Item, quantity, plant, date — in any order.'],
                ['Verify', 'The assistant asks only for what is missing and shows a slip.'],
                ['Decide', 'Policy runs immediately and the buyer sees the docket.'],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-3 px-4 py-3">
                  <span className="mono mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border border-rule-dark text-[10px] text-graphite">{i + 1}</span>
                  <span>
                    <span className="block text-[12.5px] font-medium text-ink">{title}</span>
                    <span className="mt-0.5 block text-[11.5px] leading-relaxed text-steel">{body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <div className="border-b border-rule px-4 py-2.5">
              <p className="mono text-[10px] uppercase tracking-[0.1em] text-steel">Try a request</p>
            </div>
            <div className="divide-y divide-rule">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => send(e)} className="block w-full px-4 py-2.5 text-left text-[12px] leading-relaxed text-graphite hover:bg-draftsoft/50 hover:text-draft">
                  “{e}”
                </button>
              ))}
            </div>
          </Card>

          <div className="border border-rule bg-panel/60 px-4 py-3">
            <p className="mono text-[9.5px] uppercase tracking-[0.1em] text-steel">Unknown items</p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-steel">
              If the description does not exist in the item master, the assistant says so and asks for an estimated price. It never invents a catalogue item.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const btnGhostLink = 'mono text-[10px] font-medium uppercase tracking-[0.08em] text-graphite underline decoration-rule-dark decoration-1 underline-offset-4 hover:text-draft hover:decoration-draft';
