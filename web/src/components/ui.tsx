'use client';

export function PageHeader({
  title,
  subtitle,
  meta,
  actions,
}: {
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="border-b border-rule bg-panel/80 px-6 py-5 lg:px-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">{title}</h1>
          {subtitle ? <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-steel">{subtitle}</p> : null}
          {meta ? <div className="mono mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] uppercase tracking-[0.08em] text-steel">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`panel ${className}`}>{children}</div>;
}

export function SectionTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-3">
      <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink">{children}</h2>
      {note ? <span className="mono text-[10px] uppercase tracking-[0.08em] text-steel">{note}</span> : null}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="mono text-[9.5px] uppercase tracking-[0.1em] text-steel">{label}</p>
      <p className="mono mt-1 text-[17px] font-medium leading-none text-ink">{value}</p>
      {hint ? <p className="mt-1 truncate text-[11px] text-steel">{hint}</p> : null}
    </div>
  );
}

const TONES: Record<string, string> = {
  CONTRACT_PO: 'border-draft/40 bg-draftsoft text-draft',
  SPOT_PO: 'border-success/40 bg-successsoft text-success',
  EMERGENCY_PO: 'border-signal/50 bg-signalsoft text-signal',
  RFQ: 'border-[#5d4d86]/40 bg-[#eeeaf5] text-[#5d4d86]',
  RFP: 'border-[#4c3a70]/45 bg-[#e9e3f2] text-[#4c3a70]',
  CAPEX_SOURCING: 'border-[#8a5a17]/40 bg-[#f3ead9] text-[#8a5a17]',
  NEW_ITEM_SOURCING: 'border-[#2c6a6a]/40 bg-[#e2efee] text-[#2c6a6a]',
  NOT_PROCESSED: 'border-rule-dark bg-[#eceee8] text-steel',
  PO: 'border-draft/40 bg-draftsoft text-draft',
  SOURCING_REQUEST: 'border-[#5d4d86]/40 bg-[#eeeaf5] text-[#5d4d86]',
  PENDING: 'border-amber/40 bg-ambersoft text-amber',
  APPROVED: 'border-success/40 bg-successsoft text-success',
  OVERRIDDEN: 'border-signal/50 bg-signalsoft text-signal',
  ACTIVE: 'border-success/40 bg-successsoft text-success',
  SUPERSEDED: 'border-rule-dark bg-[#eceee8] text-steel',
  DRAFT: 'border-amber/40 bg-ambersoft text-amber',
};

export function Badge({ children, tone, className = '' }: { children: React.ReactNode; tone?: string; className?: string }) {
  const cls = (tone && TONES[tone]) || 'border-rule-dark bg-[#eceee8] text-graphite';
  return (
    <span className={`mono inline-flex items-center gap-1.5 border px-1.5 py-0.5 text-[9.5px] font-medium uppercase leading-[1.5] tracking-[0.07em] ${cls} ${className}`}>
      <span className="h-1 w-1 shrink-0 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}

export function routeLabel(route: string): string {
  return route
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const btnPrimary =
  'focus-ring inline-flex items-center justify-center gap-1.5 rounded-[4px] border border-ink bg-ink px-3.5 py-2 text-[13px] font-medium text-paper transition hover:bg-graphite disabled:cursor-not-allowed disabled:opacity-45';
export const btnSecondary =
  'focus-ring inline-flex items-center justify-center gap-1.5 rounded-[4px] border border-rule-dark bg-panel px-3.5 py-2 text-[13px] font-medium text-graphite transition hover:border-draft hover:text-draft disabled:cursor-not-allowed disabled:opacity-45';
export const btnDanger =
  'focus-ring inline-flex items-center justify-center gap-1.5 rounded-[4px] border border-signal bg-signal px-3.5 py-2 text-[13px] font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45';
export const btnGhost = 'focus-ring inline-flex items-center gap-1 text-[12px] font-medium text-graphite underline decoration-rule-dark decoration-1 underline-offset-[3px] hover:text-draft hover:decoration-draft';
export const inputCls =
  'focus-ring w-full rounded-[3px] border border-rule-dark bg-white px-2.5 py-1.5 text-[13px] text-ink placeholder:text-steel/70 focus:border-draft focus:outline-none';
export const labelCls = 'mono mb-1 block text-[9.5px] font-medium uppercase tracking-[0.09em] text-steel';

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <svg width="28" height="28" viewBox="0 0 32 32" className="mb-3 text-rule-dark" aria-hidden>
        <path d="M5 22 L15 7 L19 7 L13 18 Z" fill="currentColor" />
        <path d="M12 24 L21 10 L25 10 L17 24 Z" fill="currentColor" opacity=".7" />
        <path d="M19 24 L26 14 L30 14 L24 24 Z" fill="currentColor" opacity=".45" />
      </svg>
      <p className="text-[13px] font-medium text-graphite">{title}</p>
      {hint ? <p className="mt-1 max-w-md text-[12px] leading-relaxed text-steel">{hint}</p> : null}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-1 py-1 text-[12px] text-steel">
      <span className="h-3 w-3 animate-spin rounded-full border border-rule-dark border-t-draft" />
      <span className="mono uppercase tracking-[0.08em]">{label}</span>
    </div>
  );
}

export function Alert({ children, tone = 'error' }: { children: React.ReactNode; tone?: 'error' | 'success' | 'info' }) {
  const cls =
    tone === 'error'
      ? 'border-signal/50 bg-signalsoft text-[#8f3518]'
      : tone === 'success'
        ? 'border-success/40 bg-successsoft text-success'
        : 'border-draft/30 bg-draftsoft text-draft';
  return <div className={`rounded-[3px] border px-3 py-2 text-[12.5px] leading-relaxed ${cls}`}>{children}</div>;
}

export function Mono({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`mono ${className}`}>{children}</span>;
}

export function ScoreBar({ parts, max = 100 }: { parts: Array<{ value: number; className: string; label: string }>; max?: number }) {
  return (
    <div className="flex h-1.5 w-28 overflow-hidden rounded-[1px] border border-rule bg-[#eceee8]">
      {parts.map((p, i) => (
        <span key={i} title={`${p.label}: ${p.value}`} className={p.className} style={{ width: `${(Math.max(0, p.value) / max) * 100}%` }} />
      ))}
    </div>
  );
}
