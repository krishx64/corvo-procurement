'use client';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-white px-8 py-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </Card>
  );
}

const TONES: Record<string, string> = {
  CONTRACT_PO: 'bg-blue-50 text-blue-700 ring-blue-200',
  SPOT_PO: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  EMERGENCY_PO: 'bg-amber-50 text-amber-700 ring-amber-200',
  RFQ: 'bg-violet-50 text-violet-700 ring-violet-200',
  RFP: 'bg-purple-50 text-purple-700 ring-purple-200',
  CAPEX_SOURCING: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200',
  NEW_ITEM_SOURCING: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  NOT_PROCESSED: 'bg-slate-100 text-slate-600 ring-slate-200',
  PO: 'bg-blue-50 text-blue-700 ring-blue-200',
  SOURCING_REQUEST: 'bg-violet-50 text-violet-700 ring-violet-200',
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  OVERRIDDEN: 'bg-rose-50 text-rose-700 ring-rose-200',
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  SUPERSEDED: 'bg-slate-100 text-slate-600 ring-slate-200',
  DRAFT: 'bg-amber-50 text-amber-700 ring-amber-200',
};

export function Badge({ children, tone, className = '' }: { children: React.ReactNode; tone?: string; className?: string }) {
  const cls = (tone && TONES[tone]) || 'bg-slate-100 text-slate-600 ring-slate-200';
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${cls} ${className}`}>{children}</span>;
}

export function routeLabel(route: string): string {
  return route.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50';
export const btnSecondary =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
export const btnDanger =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50';
export const btnGhost = 'inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900';
export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none';
export const labelCls = 'mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500';

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint ? <p className="mt-1 max-w-md text-sm text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
      {label}
    </div>
  );
}

export function Alert({ children, tone = 'error' }: { children: React.ReactNode; tone?: 'error' | 'success' | 'info' }) {
  const cls = tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-700';
  return <div className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}
