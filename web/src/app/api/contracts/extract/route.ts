import { bad, ok } from '@/lib/api';
import { pdfText, parseContractText } from '@/lib/pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const ct = req.headers.get('content-type') ?? '';
    if (!ct.includes('multipart/form-data')) return bad('upload the contract PDF as multipart field "file"');
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return bad('multipart field "file" (PDF) is required');
    if (!/pdf$/i.test(file.name) && file.type !== 'application/pdf') return bad('file must be a PDF');
    const text = await pdfText(new Uint8Array(await file.arrayBuffer()));
    const draft = parseContractText(text);
    return ok({ draft, text_preview: text.slice(0, 1200) });
  } catch (e) {
    return bad(e instanceof Error ? e.message : 'could not read the PDF', 500);
  }
}
