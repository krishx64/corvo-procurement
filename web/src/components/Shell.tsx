'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { setActor, useActor, type Actor } from '@/lib/client';

const NAV = [
  { href: '/', label: 'Request intake', short: 'Intake' },
  { href: '/buyer', label: 'Buyer workspace', short: 'Buyer' },
  { href: '/suppliers', label: 'Preferred suppliers', short: 'Suppliers' },
  { href: '/contracts', label: 'Rate contracts', short: 'Contracts' },
  { href: '/policy', label: 'Procurement policy', short: 'Policy' },
  { href: '/admin', label: 'Data & runs', short: 'Data' },
];

function RavenMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 24" className={className} aria-hidden="true">
      <path d="M2 22 L12 4 L16.5 4 L9 17 Z" fill="currentColor" />
      <path d="M11 22 L20 6.5 L24.5 6.5 L16.5 20 Z" fill="currentColor" opacity=".78" />
      <path d="M20 22 L28 9 L33 9 L25.5 22 Z" fill="var(--signal)" />
    </svg>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || '/';
  const [actor, updateActor] = useActor();
  const [editing, setEditing] = useState(false);

  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-ink text-paper/75 lg:flex">
        <a href="/" className="focus-ring flex items-start gap-3 border-b border-white/10 px-5 pb-5 pt-6">
          <RavenMark className="mt-0.5 h-7 w-10 shrink-0 text-paper" />
          <span>
            <span className="mono block text-[15px] font-semibold tracking-[0.16em] text-white">CORVO</span>
            <span className="mono mt-0.5 block text-[9px] uppercase tracking-[0.18em] text-paper/45">Procurement · PR→PO</span>
          </span>
        </a>

        <nav className="mt-5 flex-1 px-3">
          <p className="mono mb-2 px-2 text-[9px] uppercase tracking-[0.16em] text-paper/35">Workspace</p>
          <ul className="space-y-0.5">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className={`focus-ring flex items-center gap-2.5 border-l-2 py-2 pl-2.5 pr-2 text-[13px] transition ${
                    active(item.href)
                      ? 'border-[#8fc1da] bg-white/[0.07] font-medium text-white'
                      : 'border-transparent text-paper/65 hover:border-white/20 hover:bg-white/[0.04] hover:text-paper'
                  }`}
                >
                  <span className={`h-[5px] w-[5px] shrink-0 ${active(item.href) ? 'bg-[#8fc1da]' : 'bg-paper/25'}`} />
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-white/10 px-5 py-4">
          <p className="mono text-[9px] uppercase tracking-[0.16em] text-paper/35">Corvo Engineering</p>
          <p className="mono mt-1 text-[10px] text-paper/55">PUN1 Bhosari · CHK1 Chakan</p>
        </div>

        <div className="border-t border-white/10 p-4">
          {editing ? (
            <ActorForm actor={actor} onSave={(a) => { updateActor(a); setEditing(false); }} onCancel={() => setEditing(false)} />
          ) : (
            <button onClick={() => setEditing(true)} className="focus-ring flex w-full items-center gap-2.5 text-left">
              <span className="mono flex h-8 w-8 shrink-0 items-center justify-center border border-paper/25 text-[10px] font-medium text-paper">
                {initials(actor.name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-medium text-white">{actor.name}</span>
                <span className="mono block truncate text-[9.5px] uppercase tracking-[0.1em] text-paper/45">{actor.role} · switch</span>
              </span>
            </button>
          )}
        </div>
      </aside>

      {/* mobile chrome */}
      <div className="sticky top-0 z-30 border-b border-rule bg-ink text-paper lg:hidden">
        <div className="flex items-center gap-2.5 px-4 py-3">
          <RavenMark className="h-6 w-9 text-paper" />
          <span className="mono text-[13px] font-semibold tracking-[0.16em] text-white">CORVO</span>
          <span className="mono ml-auto text-[9px] uppercase tracking-[0.12em] text-paper/50">{actor.name}</span>
        </div>
        <nav className="scroll-thin flex gap-1 overflow-x-auto px-3 pb-2">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap border px-2.5 py-1 text-[11px] ${
                active(item.href) ? 'border-[#8fc1da] bg-white/10 text-white' : 'border-white/10 text-paper/60'
              }`}
            >
              {item.short}
            </a>
          ))}
        </nav>
      </div>

      <main className="lg:ml-60">
        <div className="draft-grid min-h-screen">{children}</div>
      </main>
    </div>
  );
}

function ActorForm({ actor, onSave, onCancel }: { actor: Actor; onSave: (a: Actor) => void; onCancel: () => void }) {
  const [name, setName] = useState(actor.name);
  const [role, setRole] = useState(actor.role);
  return (
    <div className="space-y-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mono w-full rounded-[3px] border border-white/20 bg-white/5 px-2 py-1.5 text-[12px] text-white placeholder:text-paper/35 focus:border-[#8fc1da] focus:outline-none"
        placeholder="Your name"
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="mono w-full rounded-[3px] border border-white/20 bg-white/5 px-2 py-1.5 text-[12px] text-white focus:border-[#8fc1da] focus:outline-none"
      >
        <option className="text-ink">Requester</option>
        <option className="text-ink">Buyer</option>
        <option className="text-ink">Procurement Admin</option>
      </select>
      <div className="flex gap-2">
        <button
          onClick={() => {
            if (!name.trim()) return;
            const a = { name: name.trim(), role };
            onSave(a);
            setActor(a);
          }}
          className="mono rounded-[3px] bg-[#8fc1da] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink"
        >
          Save
        </button>
        <button onClick={onCancel} className="mono rounded-[3px] border border-white/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] text-paper/70">
          Cancel
        </button>
      </div>
    </div>
  );
}
