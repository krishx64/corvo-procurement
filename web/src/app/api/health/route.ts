import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    node: process.version,
    hasDb: !!process.env.DATABASE_URL,
    ts: new Date().toISOString(),
  });
}
