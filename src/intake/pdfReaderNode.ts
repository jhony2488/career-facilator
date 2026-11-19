import { promises as fs } from 'node:fs';
import type { PdfReader } from './pdfExtractor';

/**
 * Implementação real do PdfReader: lê operadores de texto (Tj/TJ) direto do
 * arquivo — sem OCR. PDFs complexos/comprimidos devem trocar a estratégia
 * interna por `pdf-parse`/`pdfjs-dist`; o contrato do reader não muda.
 */
export function createNodePdfReader(): PdfReader {
  return {
    async extract({ path, buffer }) {
      let raw: string;
      if (buffer) {
        raw = Buffer.from(buffer).toString('latin1');
      } else if (path) {
        raw = await fs.readFile(path, 'latin1' as BufferEncoding);
      } else {
        return { text: '', pages: 0 };
      }

      const pages = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      const text = extractTextOperators(raw);
      return { text, pages: pages || (text ? 1 : 0) };
    },
  };
}

function extractTextOperators(raw: string): string {
  const parts: string[] = [];
  const literal = /\((?:\\.|[^\\()])*\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = literal.exec(raw)) !== null) {
    parts.push(unescapePdf(m[0].slice(1, m[0].lastIndexOf(')'))));
  }
  const arrayOp = /\[((?:\((?:\\.|[^\\()])*\)|\s|-?\d+\.?\d*)+)\]\s*TJ/g;
  while ((m = arrayOp.exec(raw)) !== null) {
    const inner = m[1].match(/\((?:\\.|[^\\()])*\)/g) ?? [];
    parts.push(inner.map((s) => unescapePdf(s.slice(1, -1))).join(''));
  }
  return parts.join('\n');
}

function unescapePdf(s: string): string {
  return s.replace(/\\([nrtbf\\()])/g, (_all, c: string) => {
    const map: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '\\': '\\', '(': '(', ')': ')' };
    return map[c] ?? c;
  });
}
