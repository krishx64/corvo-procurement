import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const { q, ensureSchema } = await import('@/db');
    await ensureSchema();
    const rows = await q<{ n: number }>('SELECT count(*)::int AS n FROM items');
    return NextResponse.json({ ok: true, items: rows[0]?.n ?? 0 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack?.split('\n').slice(0, 6) : undefined },
      { status: 500 },
    );
  }
}
