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

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: 'Hi — what do you need to buy? Describe it in your own words and I will raise the purchase request.' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [result, setResult] = useState<ConfirmResponse | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `Done — I raised ${res.pr_no}. The engine decision is below; the buyer can review it in the workspace.` },
      ]);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the PR');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setMessages([{ role: 'assistant', content: 'Hi — what do you need to buy? Describe it in your own words and I will raise the purchase request.' }]);
    setDraft(null);
    setReady(false);
    setCandidates([]);
    setResult(null);
    setError(null);
  }

  return (
    <div>
      <PageHeader
        title="New purchase request"
        subtitle="Chat intake · the assistant matches the item, asks only for what is missing, then runs the procurement policy."
        actions={<button className={btnSecondary} onClick={reset}>Start over</button>}
      />
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[1fr_320px]">
        <Card className="flex h-[calc(100vh-11rem)] min-h-[520px] flex-col overflow-hidden">
          <div ref={scrollRef} className="scroll-thin flex-1 space-y-4 overflow-y-auto p-5">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === 'user' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {ready && draft ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Ready to raise</p>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-800">
                  <span className="text-slate-500">Item</span><span>{draft.item_code ? `${draft.item_description} (${draft.item_code})` : `${draft.item_description ?? draft.item_query} · new item`}</span>
                  <span className="text-slate-500">Quantity</span><span>{fmtQty(draft.quantity)} {draft.uom ?? ''}</span>
                  <span className="text-slate-500">Plant</span><span>{draft.plant}</span>
                  <span className="text-slate-500">Need by</span><span>{draft.need_by_date}{draft.urgency === 'Emergency' ? ' · Emergency' : ''}</span>
                  {draft.is_new_item ? (<><span className="text-slate-500">Est. unit price</span><span>{fmtInr(draft.estimated_unit_price)}</span></>) : null}
                </div>
                <div className="mt-3 flex gap-2">
                  <button className={btnPrimary} onClick={confirm} disabled={busy}>Create PR</button>
                  <button className={btnSecondary} onClick={() => send('Change something')}>Change</button>
                </div>
              </div>
            ) : null}
            {result ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{result.pr_no}</span>
                  <Badge tone={result.decision.route}>{routeLabel(result.decision.route)}</Badge>
                  <Badge tone="PENDING">Awaiting buyer</Badge>
                  <span className="text-xs text-slate-500">policy {result.decision.policy_version}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-800">
                  <span className="text-slate-500">Requirement</span><span>{result.decision.group_id}</span>
                  <span className="text-slate-500">Value</span><span>{fmtInr(result.decision.group_value_inr)}</span>
                  {result.decision.supplier_id ? (<><span className="text-slate-500">Supplier</span><span>{result.decision.supplier_id} @ {fmtInr(result.decision.unit_price)}</span></>) : null}
                  {result.decision.suggested_supplier_ids ? (<><span className="text-slate-500">Suggested</span><span>{result.decision.suggested_supplier_ids.split(';').join(', ')}</span></>) : null}
                  {result.decision.po_id ? (<><span className="text-slate-500">PO</span><span>{result.decision.po_id}</span></>) : null}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">{result.decision.reason}</p>
              </div>
            ) : null}
            {busy ? <Spinner label="Thinking…" /> : null}
            {error ? <Alert>{error}</Alert> : null}
          </div>
          <div className="border-t border-slate-200 p-3">
            {candidates.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {candidates.map((c) => (
                  <button key={c.item_code} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50" onClick={() => send(c.item_code)}>
                    {c.description} · {c.item_code}
                  </button>
                ))}
              </div>
            ) : null}
            <form
              onSubmit={(e) => { e.preventDefault(); send(input); }}
              className="flex items-end gap-2"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                rows={2}
                placeholder="e.g. need 200 nitrile gloves for Chakan by next Friday"
                className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              />
              <button type="submit" className={btnPrimary} disabled={busy || !input.trim()}>Send</button>
            </form>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <p className="text-sm font-semibold text-slate-900">Try an example</p>
            <div className="mt-3 space-y-2">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => send(e)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-700 hover:border-slate-300 hover:bg-white">
                  “{e}”
                </button>
              ))}
            </div>
          </Card>
          <Card className="p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">How it decides</p>
            <p className="mt-2 leading-relaxed">
              The assistant fills quantity, plant and need-by — then the policy engine clubs the line into a requirement and picks
              a contract PO, spot PO, emergency PO, RFQ, RFP or capex sourcing. Unknown items become new-item sourcing.
            </p>
            <p className="mt-3 text-xs text-slate-500">Need a whole batch? Upload a PR CSV in Data &amp; runs.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
