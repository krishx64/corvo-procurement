import { ensureSchema, q } from '@/db';
import { bad, ok } from '@/lib/api';
import { parseMessage, mergeDraft, missing, type ChatDraft } from '@/lib/chatNlu';
import type { Item } from '@/engine/types';

export const dynamic = 'force-dynamic';

function istNow(): Date {
  const s = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' });
  return new Date(s);
}

function askFor(slot: string): string {
  switch (slot) {
    case 'item':
      return 'What do you need to order? You can give an item name or an item code (ITM-…).';
    case 'quantity':
      return 'How many do you need?';
    case 'plant':
      return 'Which plant is this for — PUN1 (Bhosari) or CHK1 (Chakan)?';
    case 'need_by_date':
      return 'When do you need it by?';
    case 'urgency':
      return 'Is this a normal request or urgent? Say “urgent” if it must be expedited (emergency up to ₹5,00,000 can be bought without quotes).';
    case 'estimated_unit_price':
      return 'This item is not in the item master, so it will be raised as a new item for sourcing. What unit price do you estimate (INR)?';
    default:
      return 'Could you add a bit more detail?';
  }
}

export async function POST(req: Request) {
  await ensureSchema();
  const body = await req.json().catch(() => null);
  if (!body) return bad('JSON body required');
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const userMessages = messages.filter((m: any) => m.role === 'user').map((m: any) => String(m.content ?? ''));

  const items = await q<Item>(`SELECT item_code, description, uom, category, item_type, standard_price FROM items ORDER BY item_code`);
  if (!items.length) return bad('no items loaded — seed the master data first', 500);

  const now = istNow();
  let draft: ChatDraft = {};
  let lastParsed;
  for (const text of userMessages) {
    lastParsed = parseMessage(text, items, now);
    draft = mergeDraft(draft, lastParsed);
  }

  // Ambiguous description: present the candidates instead of guessing.
  if (!draft.item_code && !draft.is_new_item && lastParsed?.matched?.ambiguous) {
    const top = lastParsed.matched.candidates.slice(0, 3);
    if (top.length > 0) {
      draft.candidates = top;
      return ok({
        reply:
          `I found more than one possible item for “${draft.item_query}”:\n` +
          top.map((c, i) => `${i + 1}. ${c.description} (${c.item_code})`).join('\n') +
          '\nReply with the item code to pick one, or describe it differently.',
        draft,
        candidates: top,
        ready: false,
      });
    }
  }

  if (draft.candidates?.length && !draft.item_code) {
    draft.candidates = undefined;
  }

  const need = missing(draft);
  if (need.length > 0) {
    return ok({
      reply: askFor(need[0]),
      draft,
      ready: false,
      missing: need,
      quickReplies: need[0] === 'urgency' ? ['Normal', 'Urgent'] : undefined,
    });
  }

  return ok({
    reply: 'Everything needed is here. Check the requisition slip below and raise it when it looks right.',
    draft,
    ready: true,
    missing: [],
  });
}
