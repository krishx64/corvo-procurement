import { extractText, getDocumentProxy } from 'unpdf';

export async function pdfText(data: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

export interface ParsedContractDraft {
  contract_id: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  start_date: string | null;
  end_date: string | null;
  value_cap: number | null;
  lines: Array<{ item_code: string; description: string; uom: string; rate: number }>;
}

/** Extract a rate contract from the signed PDF format used by Corvo. */
export function parseContractText(text: string): ParsedContractDraft {
  const flat = text.replace(/\s+/g, ' ');
  const contract_id = flat.match(/Contract No\.?\s*(RC-\d{4}-\d{3})/i)?.[1] ?? null;
  const supplier_id = flat.match(/\(Supplier ID (S\d{3})\)/i)?.[1] ?? null;
  const supplier_name = flat.match(/and ([A-Za-z0-9 .&'-]+?)\s*\(Supplier ID/i)?.[1]?.trim() ?? null;
  const dates = flat.match(/valid from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/i);
  const capRaw = flat.match(/not exceed INR\s*([\d,]+(?:\.\d+)?)/i)?.[1];
  const lines: ParsedContractDraft['lines'] = [];
  const re = /(ITM-\d{4})\s+(.+?)\s+(NOS|KG|LTR|MTR|SET|BRL|BKT|PAIR|CYL|ROL|MON|QTR|JOB|REAM)\s+([\d,]+\.\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat))) {
    lines.push({ item_code: m[1], description: m[2].trim(), uom: m[3], rate: Number(m[4].replace(/,/g, '')) });
  }
  return {
    contract_id,
    supplier_id,
    supplier_name,
    start_date: dates?.[1] ?? null,
    end_date: dates?.[2] ?? null,
    value_cap: capRaw ? Number(capRaw.replace(/,/g, '')) : null,
    lines,
  };
}
