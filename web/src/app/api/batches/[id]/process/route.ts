import { bad, ok, actorFrom } from '@/lib/api';
import { processBatch } from '@/lib/process';
import { ensureSchema } from '@/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await ensureSchema();
    const { id } = await ctx.params;
    const batchId = Number(id);
    if (!Number.isFinite(batchId)) return bad('invalid batch id');
    const mode = new URL(req.url).searchParams.get('policy') === 'latest' ? 'latest' : 'requirement_date';
    const result = await processBatch(batchId, actorFrom(req), mode);
    return ok(result);
  } catch (e) {
    return bad(e instanceof Error ? e.message : 'process failed', 500);
  }
}
