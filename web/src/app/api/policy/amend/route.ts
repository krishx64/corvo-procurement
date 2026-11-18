import { bad, ok } from '@/lib/api';
import { parseAmendment, plainPolicy } from '@/engine/amendment';
import { policyForDate } from '@/engine/policy';
import { loadPolicies } from '@/lib/data';
import { pdfText } from '@/lib/pdf';
import type { PolicyDoc } from '@/engine/types';
import { ensureSchema } from '@/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    await ensureSchema();
    const ct = req.headers.get('content-type') ?? '';
    let text = '';
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (file instanceof File) text = /pdf$/i.test(file.name) ? await pdfText(new Uint8Array(await file.arrayBuffer())) : await file.text();
      else text = String(form.get('text') ?? '');
    } else {
      const body = await req.json().catch(() => ({}));
      text = String(body.text ?? '');
    }
    if (!text.trim()) return bad('amendment text or file is required');

    const policies = await loadPolicies();
    if (!policies.length) return bad('no active policy to amend', 500);
    const current = policyForDate(policies, new Date().toISOString().slice(0, 10));
    const result = parseAmendment(text, current);

    return ok({
      current_version: current.version,
      current_plain: plainPolicy(current),
      proposed: result.proposed,
      proposed_plain: plainPolicy(result.proposed),
      changes: result.changes,
      unparsed: result.unparsed,
      text_preview: text.slice(0, 2000),
    });
  } catch (e) {
    return bad(e instanceof Error ? e.message : 'could not read the amendment', 500);
  }
}
