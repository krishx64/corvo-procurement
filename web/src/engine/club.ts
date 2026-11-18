import { dayDiff } from './dates';
import type { Item, PolicyDoc, PrLineInput, Requirement } from './types';

export interface ClubResult {
  requirements: Requirement[];
  warnings: string[];
}

export function lineKey(l: Pick<PrLineInput, 'pr_no' | 'pr_line'>): string {
  return `${l.pr_no}/${l.pr_line}`;
}

function compareLines(a: PrLineInput, b: PrLineInput): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  if (a.pr_no !== b.pr_no) return a.pr_no < b.pr_no ? -1 : 1;
  return a.pr_line - b.pr_line;
}

/**
 * Policy 2.1-2.3. Lines arrive already validated (quantity > 0, valid dates).
 * `resolved` maps line key -> matched item (undefined => new item, never clubbed).
 */
export function clubLines(
  lines: PrLineInput[],
  resolved: Map<string, Item | undefined>,
  policy: PolicyDoc,
): ClubResult {
  const sorted = [...lines].sort(compareLines);
  const requirements: Requirement[] = [];
  const warnings: string[] = [];
  let tempId = 0;

  for (const line of sorted) {
    const item = resolved.get(lineKey(line));
    let joined: Requirement | undefined;

    if (item) {
      for (const req of requirements) {
        if (!req.item || req.item.item_code !== item.item_code) continue;
        if (req.plant !== line.plant) continue;
        if (dayDiff(req.first_line_at, line.created_at) > policy.clubbing.creation_window_days) continue;
        if (Math.abs(dayDiff(req.need_by_date, line.need_by_date ?? req.need_by_date)) > policy.clubbing.need_by_window_days) continue;
        joined = req;
        break; // requirements are stored in first-line creation order => earliest match
      }
    }

    if (joined) {
      joined.lines.push(line);
      joined.total_qty += line.quantity;
      if (line.urgency === 'Emergency') joined.is_emergency = true;
    } else {
      requirements.push({
        id: `tmp-${++tempId}`,
        group_id: '',
        lines: [line],
        first_line_at: line.created_at,
        need_by_date: line.need_by_date!,
        plant: line.plant,
        item,
        total_qty: line.quantity,
        is_emergency: line.urgency === 'Emergency',
      });
    }
  }

  // Deterministic requirement order: first line creation time.
  requirements.sort((a, b) => (a.first_line_at < b.first_line_at ? -1 : a.first_line_at > b.first_line_at ? 1 : 0));
  return { requirements, warnings };
}
