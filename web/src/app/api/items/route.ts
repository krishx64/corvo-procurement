import { ensureSchema, q } from '@/db';
import { ok } from '@/lib/api';
import { matchItem } from '@/engine/match';
import type { Item } from '@/engine/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  await ensureSchema();
  const url = new URL(req.url);
  const query = (url.searchParams.get('q') ?? '').trim();
  const [items, suppliers] = await Promise.all([
    q<Item>(`SELECT item_code, description, uom, category, item_type, standard_price FROM items ORDER BY item_code`),
    q(`SELECT supplier_id, name, status, categories FROM suppliers ORDER BY supplier_id`),
  ]);
  if (!query) {
    return ok({ items: [], suppliers, total_items: items.length });
  }
  const match = matchItem(query, items);
  const candidates = match.candidates.map((c) => ({ ...c.item, score: Math.round(c.score * 100) / 100 }));
  const code = query.match(/ITM-\d{4}/i)?.[0]?.toUpperCase();
  if (code) {
    const exact = items.find((i) => i.item_code === code);
    if (exact) return ok({ items: [{ ...exact, score: 1 }], suppliers });
  }
  return ok({ items: candidates, suppliers, ambiguous: match.ambiguous });
}
