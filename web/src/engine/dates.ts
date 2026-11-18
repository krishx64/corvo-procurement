// Calendar helpers. The kit uses local plant time as naive strings; we treat all
// dates as UTC-consistent to avoid timezone drift while keeping the literal values.

export function parseDate(d: string): Date {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, day ?? 1));
}

export function parseDateTime(s: string): Date {
  const datePart = s.slice(0, 10);
  const timePart = s.slice(11, 16);
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = (timePart || '00:00').split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh || 0, mm || 0));
}

/** Whole calendar days between two date strings/dates (b - a). */
export function dayDiff(a: Date | string, b: Date | string): number {
  const da = typeof a === 'string' ? parseDate(a) : a;
  const db = typeof b === 'string' ? parseDate(b) : b;
  const ua = Date.UTC(da.getUTCFullYear(), da.getUTCMonth(), da.getUTCDate());
  const ub = Date.UTC(db.getUTCFullYear(), db.getUTCMonth(), db.getUTCDate());
  return Math.round((ub - ua) / 86400000);
}

export function hoursDiff(a: Date | string, b: Date | string): number {
  const da = typeof a === 'string' ? parseDateTime(a) : a;
  const db = typeof b === 'string' ? parseDateTime(b) : b;
  return (db.getTime() - da.getTime()) / 3600000;
}

export function isValidDate(s: string | null | undefined): boolean {
  if (!s) return false;
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return false;
  return !Number.isNaN(parseDate(s).getTime());
}

export function isValidDateTime(s: string | null | undefined): boolean {
  if (!s) return false;
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) return false;
  return !Number.isNaN(parseDateTime(s).getTime());
}
