import * as chrono from 'chrono-node';
import { matchItem } from '@/engine/match';
import type { Item } from '@/engine/types';

export interface ChatDraft {
  item_code?: string | null;
  item_description?: string;
  item_query?: string;
  candidates?: Array<{ item_code: string; description: string; score: number }>;
  quantity?: number;
  plant?: string;
  need_by_date?: string;
  urgency?: 'Normal' | 'Emergency';
  estimated_unit_price?: number;
  uom?: string;
  is_new_item?: boolean;
}

const SIZE_WORDS = 'mm|cm|mtr|meter|metre|m|inch|in|ft|kg|g|gm|ltr|litre|liter|ml|nos|pcs|pc|pair|pr|set|job|rol|roll|bkt|brl|mon|qtr|cyl|sqmm|kw|hp|ton|tonne|t';

function stripSizes(text: string): string {
  return text
    .replace(/\bITM-\d{4}\b/gi, ' ')
    .replace(/\b\d+\s*[/x×]\s*\d+\b/gi, ' ')
    .replace(new RegExp(`\\b\\d+(?:\\.\\d+)?\\s*(?:${SIZE_WORDS})\\b`, 'gi'), ' ')
    .replace(new RegExp(`\\b[A-Za-z]{1,6}\\d+(?:[A-Za-z0-9.-]*)\\b`, 'g'), ' ')
    .replace(/\b\d{4,}\b/g, ' ');
}

function firstNumber(text: string): number | undefined {
  const m = text.match(/(?<![\w.-])([\d,]{1,9})(?![\w.-])/);
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function cleanDescription(text: string): string {
  let s = text;
  s = s.replace(/\bITM-\d{4}\b/gi, ' ');
  s = s.replace(/\b(?:qty|quantity)\s*[:=]?\s*[\d,]+/gi, ' ');
  s = s.replace(/\b(?:please\s+)?(?:i\s+)?(?:need|want|require|raise|create|place|order|buy|get|purchase|request|book)\b/gi, ' ');
  s = s.replace(/\b(?:for|at|deliver(?:ed)? to|ship(?:ped)? to)\s+(?:the\s+)?(?:plant\s+)?(?:pun1|chk1|pun2|pune|bhosari|chakan)\b/gi, ' ');
  s = s.replace(/\b(?:pun1|chk1|pun2|pune|bhosari|chakan)\b/gi, ' ');
  s = s.replace(/\b(?:urgent|urgently|emergency|asap|immediately|critical|normal|routine|standard)\b/gi, ' ');
  s = s.replace(/\b(?:price|cost|estimate|budget)\s*(?:is|of|at|:)?\s*(?:₹|rs\.?|inr)?\s*[\d,.]+/gi, ' ');
  // bare connector words left behind by the replacements above
  s = s.replace(/\b(?:by|for|at|on|before|needed|required)\s*$/i, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s.replace(/^[\s:;,.-]+|[\s:;,.-]+$/g, '');
}

export interface ParsedMessage {
  fields: ChatDraft;
  matched?: { item: Item; ambiguous: boolean; candidates: Array<{ item_code: string; description: string; score: number }> };
  newItemQuery?: string;
  explicitCode?: boolean;
}

export function parseMessage(raw: string, items: Item[], now: Date): ParsedMessage {
  const text = raw.trim();
  const fields: ChatDraft = {};

  const code = text.match(/\bITM-\d{4}\b/i)?.[0]?.toUpperCase();
  if (code) fields.item_code = code;

  // quantity: explicit marker first, else the first plausible standalone number.
  const cleaned = stripSizes(text);
  const explicit = cleaned.match(/\b(?:qty|quantity)\s*[:=]?\s*([\d,]+)/i) ?? cleaned.match(/\b(?:need|required|order)\s+([\d,]{1,7})\b/i);
  let qty: number | undefined;
  if (explicit) {
    qty = Number(explicit[1].replace(/,/g, ''));
  } else {
    const n = firstNumber(cleaned);
    if (n != null && n > 0 && n <= 5000) qty = n;
  }
  if (qty != null && Number.isFinite(qty)) fields.quantity = qty;

  if (/\b(pun1|pune|bhosari)\b/i.test(text)) fields.plant = 'PUN1';
  if (/\b(chk1|chakan)\b/i.test(text)) fields.plant = 'CHK1';
  if (/\bpun2\b/i.test(text)) fields.plant = 'PUN2';

  if (/\b(urgent|urgently|emergency|asap|immediately|critical|breakdown)\b/i.test(text)) fields.urgency = 'Emergency';
  else if (/\b(normal|routine|standard)\b/i.test(text)) fields.urgency = 'Normal';

  const priceMatch =
    text.match(/(?:₹|rs\.?\s*|inr\s*)([\d,]+(?:\.\d+)?)/i) ??
    text.match(/\b(?:price|cost|estimate(?:d)?(?:\s+unit\s+price)?|budget)\s*(?:is|of|at|:)?\s*(?:₹|rs\.?\s*|inr\s*)?([\d,]+(?:\.\d+)?)/i);
  if (priceMatch) {
    const p = Number(priceMatch[1].replace(/,/g, ''));
    if (Number.isFinite(p) && p > 0) fields.estimated_unit_price = p;
  }

  const chronoHits = chrono.parse(text, now, { forwardDate: true });
  if (chronoHits.length > 0) {
    const d = chronoHits[0].start.date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    fields.need_by_date = iso;
  }

  // Build the item description without the quantity and the date phrase so they
  // do not pollute item matching.
  let descSource = text;
  if (qty != null) descSource = descSource.replace(new RegExp(`(?<![\\w.-])${qty}(?![\\w.-])`), ' ');
  if (chronoHits[0]?.text) descSource = descSource.replace(chronoHits[0].text, ' ');
  const desc = cleanDescription(descSource) || cleanDescription(descSource.replace(/[\d,]+/g, ' '));
  const matched = desc.length >= 2 ? matchItem(desc, items) : undefined;
  const byCode = code ? items.find((i) => i.item_code === code) : undefined;

  if (byCode) {
    fields.item_code = byCode.item_code;
    fields.item_description = byCode.description;
    fields.uom = byCode.uom;
    fields.is_new_item = false;
  } else if (matched && matched.item) {
    fields.item_code = matched.item.item_code;
    fields.item_description = matched.item.description;
    fields.uom = matched.item.uom;
    fields.is_new_item = false;
  } else if (desc.length >= 2) {
    fields.item_query = desc;
  }

  return {
    fields,
    matched: matched ? { item: matched.item as Item, ambiguous: matched.ambiguous, candidates: matched.candidates.map((c) => ({ item_code: c.item.item_code, description: c.item.description, score: Math.round(c.score * 100) / 100 })) } : undefined,
    newItemQuery: !byCode && !matched?.item && desc.length >= 2 ? desc : undefined,
    explicitCode: !!code,
  };
}

export function mergeDraft(base: ChatDraft, next: ParsedMessage): ChatDraft {
  const d: ChatDraft = { ...base };
  const f = next.fields;
  const ambiguousNow = !!(next.matched?.ambiguous && (next.matched.candidates?.length ?? 0) > 1);

  if (ambiguousNow && !next.explicitCode) {
    // Present the choices instead of silently binding the top-scoring item.
    d.item_code = undefined;
    d.item_query = f.item_query ?? f.item_description ?? d.item_query;
    d.candidates = next.matched!.candidates.slice(0, 3);
    d.is_new_item = false;
  } else if (f.item_code) {
    d.item_code = f.item_code;
    d.item_description = f.item_description ?? d.item_description;
    d.uom = f.uom ?? d.uom;
    d.is_new_item = false;
    d.candidates = undefined;
  } else if (f.item_query && !base.item_code) {
    d.item_query = f.item_query;
    d.candidates = next.matched?.candidates?.slice(0, 3);
    if (next.newItemQuery && (!next.matched || !next.matched.item)) {
      d.item_code = null;
      d.is_new_item = true;
      d.item_description = f.item_query;
    }
  }
  if (f.quantity != null) d.quantity = f.quantity;
  if (f.plant) d.plant = f.plant;
  if (f.need_by_date) d.need_by_date = f.need_by_date;
  if (f.urgency) d.urgency = f.urgency;
  if (f.estimated_unit_price != null) d.estimated_unit_price = f.estimated_unit_price;
  return d;
}

export function missing(d: ChatDraft): string[] {
  const out: string[] = [];
  if (!d.item_code && !d.is_new_item) out.push('item');
  if (d.quantity == null) out.push('quantity');
  if (!d.plant) out.push('plant');
  if (!d.need_by_date) out.push('need_by_date');
  if (!d.urgency) out.push('urgency');
  if (d.is_new_item && d.estimated_unit_price == null) out.push('estimated_unit_price');
  return out;
}

export function summary(d: ChatDraft): string {
  const lines = [
    `Item: ${d.item_code ? `${d.item_description} (${d.item_code})` : `${d.item_description ?? d.item_query} — new item, sourcing`}`,
    `Quantity: ${d.quantity} ${d.uom ?? ''}`.trim(),
    `Plant: ${d.plant === 'PUN1' ? 'PUN1 (Bhosari)' : d.plant === 'CHK1' ? 'CHK1 (Chakan)' : d.plant}`,
    `Need by: ${d.need_by_date}${d.urgency === 'Emergency' ? ' · EMERGENCY' : ''}`,
  ];
  if (d.is_new_item && d.estimated_unit_price != null) lines.push(`Estimated unit price: ₹${d.estimated_unit_price}`);
  return lines.join('\n');
}
