import { NextResponse } from 'next/server';
import { q } from '@/db';

export interface Actor {
  name: string;
  role: string;
}

export function actorFrom(req: Request): Actor {
  return {
    name: (req.headers.get('x-actor') || 'Demo User').slice(0, 80),
    role: (req.headers.get('x-role') || 'Buyer').slice(0, 30),
  };
}

export async function audit(
  actor: Actor,
  action: string,
  entity: string,
  entityId: string | number,
  details?: unknown,
): Promise<void> {
  await q(
    `INSERT INTO audit_log (actor, role, action, entity, entity_id, details) VALUES ($1,$2,$3,$4,$5,$6)`,
    [actor.name, actor.role, action, entity, String(entityId), details ? JSON.stringify(details) : null],
  );
}

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function csvResponse(csv: string, filename: string) {
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
