import { bad, csvResponse } from '@/lib/api';
import { runCsv } from '@/lib/process';
import { ensureSchema, q } from '@/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const { id } = await ctx.params;
  const runId = Number(id);
  if (!Number.isFinite(runId)) return bad('invalid run id');
  const [run] = await q<{ id: number }>(`SELECT id FROM runs WHERE id=$1`, [runId]);
  if (!run) return bad('run not found', 404);
  return csvResponse(await runCsv(runId), `decisions-run-${runId}.csv`);
}
