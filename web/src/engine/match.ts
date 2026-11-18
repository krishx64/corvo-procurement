import type { Item } from './types';

// Requesters use short forms; expand them before token scoring.
const ABBREV: Record<string, string> = {
  brg: 'bearing',
  brgs: 'bearing',
  hyd: 'hydraulic',
  hydr: 'hydraulic',
  pneu: 'pneumatic',
  pneum: 'pneumatic',
  cyl: 'cylinder',
  mch: 'machine',
  dia: 'diameter',
};

// Words that carry no item identity in a PR description.
const STOP = new Set([
  'for', 'the', 'and', 'with', 'of', 'to', 'a', 'an', 'as', 'per', 'by',
  'sample', 'maintenance', 'urgent', 'repeat', 'qty', 'nos', 'pcs', 'no',
]);

/** Light singularisation: requesters type plurals, the master is mostly singular. */
function singular(t: string): string {
  if (t.length <= 3) return t;
  if (/(ss|us|is)$/.test(t)) return t;
  if (t.endsWith('ies') && t.length > 4) return t.slice(0, -3) + 'y';
  if (t.endsWith('s')) return t.slice(0, -1);
  return t;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !STOP.has(t))
    .map((t) => singular(ABBREV[t] ?? t));
}

const weight = (t: string): number => (/\d/.test(t) ? 2 : 1);

function dice(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const bCount = new Map<string, number>();
  for (const t of b) bCount.set(t, (bCount.get(t) ?? 0) + 1);
  let inter = 0;
  const used = new Map<string, number>();
  for (const t of a) {
    const have = bCount.get(t) ?? 0;
    const seen = used.get(t) ?? 0;
    if (seen < have) {
      inter += weight(t);
      used.set(t, seen + 1);
    }
  }
  const wA = a.reduce((s, t) => s + weight(t), 0);
  const wB = b.reduce((s, t) => s + weight(t), 0);
  return (2 * inter) / (wA + wB);
}

export interface MatchCandidate {
  item: Item;
  score: number;
}

export interface MatchResult {
  item?: Item;
  score: number;
  ambiguous: boolean;
  candidates: MatchCandidate[];
}

const THRESHOLD = 0.5;
const AMBIGUITY_GAP = 0.1;

/**
 * Deterministic description -> item master matcher.
 * Rules:
 *  - weighted token Dice (numbers/dimensions weigh double)
 *  - every digit-bearing token in the request must exist in the item description
 *    (prevents matching e.g. "HLP 46" to "HLP 68")
 *  - below threshold => no match (new item), never invent a match.
 */
export function matchItem(description: string, items: Item[]): MatchResult {
  const input = tokenize(description);
  if (input.length === 0) return { score: 0, ambiguous: false, candidates: [] };

  const scored: MatchCandidate[] = items
    .map((item) => ({ item, score: dice(input, tokenize(item.description)) }))
    .map((c) => {
      const itemTokens = new Set(tokenize(c.item.description));
      const numericMiss = input.some((t) => /\d/.test(t) && !itemTokens.has(t));
      return numericMiss ? { ...c, score: Math.min(c.score, THRESHOLD - 0.01) } : c;
    })
    .sort((a, b) => b.score - a.score || a.item.item_code.localeCompare(b.item.item_code));

  const top = scored[0];
  const viable = scored.filter((c) => c.score >= THRESHOLD);
  const ambiguous = viable.length >= 2 && viable[0].score - viable[1].score < AMBIGUITY_GAP;

  if (top.score < THRESHOLD) {
    return { score: top.score, ambiguous: false, candidates: scored.slice(0, 3) };
  }
  return { item: top.item, score: top.score, ambiguous, candidates: scored.slice(0, 3) };
}
