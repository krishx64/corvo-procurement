import { Pool, types } from 'pg';
import { SCHEMA_SQL } from './schema';

// Keep DATE/TIMESTAMP values as literal strings and NUMERIC as JS numbers.
types.setTypeParser(1082, (v: string) => v);
types.setTypeParser(1114, (v: string) => v);
types.setTypeParser(1184, (v: string) => v);
types.setTypeParser(1700, (v: string) => (v === null ? null : Number(v)));

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  pool = new Pool({
    connectionString: url,
    ssl: url.includes('neon.tech') || process.env.PGSSL === '1' ? { rejectUnauthorized: false } : undefined,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
  // Idle clients can be reset by the server/proxy (Neon does this routinely);
  // swallow the idle error so a stale connection never crashes the process.
  pool.on('error', (err) => {
    console.error('pg idle client error:', err.message);
  });
  return pool;
}

function isTransient(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? '';
  return ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', '57P01', '08006', '08001'].includes(code);
}

async function queryWithRetry(sql: string, params: unknown[]): Promise<any> {
  try {
    return await getPool().query(sql, params as any[]);
  } catch (err) {
    if (!isTransient(err)) throw err;
    // Neon and other poolers recycle idle connections; one fresh retry is enough.
    await new Promise((r) => setTimeout(r, 250));
    return getPool().query(sql, params as any[]);
  }
}

export async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await queryWithRetry(sql, params);
  return res.rows as T[];
}

let schemaReady = false;
export async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await q(SCHEMA_SQL);
  schemaReady = true;
}
