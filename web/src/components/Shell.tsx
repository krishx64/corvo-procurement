'use client';

import { useEffect, useState } from 'react';
import { setActor, useActor, type Actor } from '@/lib/client';

const NAV = [
  { href: '/', label: 'New request', hint: 'Chat intake' },
  { href: '/buyer', label: 'Buyer workspace', hint: 'Review & decide' },
  { href: '/suppliers', label: 'Preferred suppliers', hint: 'Ranked lists' },
  { href: '/contracts', label: 'Contracts', hint: 'Register & PDFs' },
  { href: '/policy', label: 'Procurement policy', hint: 'Versions & amendments' },
  { href: '/admin', label: 'Data & runs', hint: 'Uploads & exports' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [path, setPath] = useState('/');
  const [actor, updateActor] = useActor();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setPath(window.location.pathname);
    const onNav = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onNav);
    return () => window.removeEventListener('popstate', onNav);
  }, []);

  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col bg-slate-950 text-slate-300">
        <a href="/" className="flex items-center gap-3 px-5 py-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400 font-bold text-slate-950">C</span>
          <span>
            <span className="block text-sm font-semibold tracking-wide text-white">CORVO</span>
            <span className="block text-[11px] uppercase tracking-[0.18em] text-slate-500">Procurement</span>
          </span>
        </a>
        <nav className="mt-2 flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2.5 transition ${
                active(item.href) ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-slate-100'
              }`}
            >
              <span className="block text-sm font-medium">{item.label}</span>
              <span className="block text-[11px] text-slate-500">{item.hint}</span>
            </a>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          {editing ? (
            <ActorForm
              actor={actor}
              onSave={(a) => { updateActor(a); setEditing(false); }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <button onClick={() => setEditing(true)} className="w-full text-left">
              <span className="block text-[11px] uppercase tracking-wider text-slate-500">Acting as</span>
              <span className="mt-1 block text-sm font-medium text-white">{actor.name}</span>
              <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] text-emerald-300">
                {actor.role} · change
              </span>
            </button>
          )}
        </div>
      </aside>
      <main className="ml-64 flex-1">{children}</main>
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
        className="w-full rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white placeholder:text-slate-500 focus:outline-none"
        placeholder="Your name"
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="w-full rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white focus:outline-none"
      >
        <option>Requester</option>
        <option>Buyer</option>
        <option>Procurement Admin</option>
      </select>
      <div className="flex gap-2">
        <button onClick={() => { if (name.trim()) onSave({ name: name.trim(), role }); setActor({ name: name.trim() || actor.name, role }); }} className="rounded-md bg-emerald-400 px-2.5 py-1 text-xs font-semibold text-slate-950">
          Save
        </button>
        <button onClick={onCancel} className="rounded-md border border-white/15 px-2.5 py-1 text-xs text-slate-300">
          Cancel
        </button>
      </div>
    </div>
  );
}
