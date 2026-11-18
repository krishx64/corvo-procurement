'use client';

import { useEffect, useState } from 'react';

export interface Actor {
  name: string;
  role: string;
}

const KEY = 'corvo.actor';
const DEFAULT: Actor = { name: 'Demo Buyer', role: 'Buyer' };

export function getActor(): Actor {
  if (typeof window === 'undefined') return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Actor;
    if (!parsed.name) return DEFAULT;
    return parsed;
  } catch {
    return DEFAULT;
  }
}

export function setActor(a: Actor): void {
  localStorage.setItem(KEY, JSON.stringify(a));
  window.dispatchEvent(new Event('corvo-actor'));
}

export function useActor(): [Actor, (a: Actor) => void] {
  const [actor, setLocal] = useState<Actor>(DEFAULT);
  useEffect(() => {
    setLocal(getActor());
    const onChange = () => setLocal(getActor());
    window.addEventListener('corvo-actor', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('corvo-actor', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);
  return [actor, (a: Actor) => { setActor(a); setLocal(a); }];
}

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const actor = getActor();
  const headers = new Headers(init?.headers);
  headers.set('x-actor', actor.name);
  headers.set('x-role', actor.role);
  if (init?.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const res = await fetch(path, { ...init, headers, cache: 'no-store' });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const message = typeof data === 'object' && data && 'error' in data ? String((data as any).error) : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export function fmtInr(n: number | string | null | undefined, digits = 2): string {
  if (n == null || n === '') return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtQty(n: number | string | null | undefined): string {
  if (n == null) return '—';
  const num = Number(n);
  return Number.isInteger(num) ? num.toLocaleString('en-IN') : num.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

export function shortReason(reason: string | null | undefined): string {
  if (!reason) return '';
  const m = reason.match(/Rule\s+([\d.]+[A-Za-z]?)/);
  return m ? `Rule ${m[1]}` : reason.slice(0, 40);
}
