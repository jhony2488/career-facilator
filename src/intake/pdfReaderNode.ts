import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import type { PdfReader } from './pdfExtractor';
import { runtimeDir } from '../utils/runtimeModules';

/**
 * Implementação real do PdfReader: lê operadores de texto (Tj/TJ) direto do
 * arquivo — sem OCR. Streams FlateDecode são infladas antes do scan (a
 * maioria dos PDFs reais comprime o conteúdo). PDFs com fontes CID/toUnicode
 * ou OCR ainda precisam de `pdf-parse`/`pdfjs-dist`; o contrato não muda.
 */
export function createNodePdfReader(): PdfReader {
  return {
    async extract({ path, buffer }) {
      let rawBuffer: Buffer | undefined;
      let raw = '';
      if (buffer) {
        rawBuffer = Buffer.from(buffer);
      } else if (path) {
        rawBuffer = await fs.readFile(path);
      }
      if (rawBuffer) raw = rawBuffer.toString('latin1');
      if (!rawBuffer) return { text: '', pages: 0 };

      // Fontes CID/ToUnicode (PDFs modernos) exigem mapeamento real — usa
      // pdf-parse quando disponível; senão cai no scan de operadores.
      const parsed = await tryPdfParse(rawBuffer);
      if (parsed) return parsed;

      const pages = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      const text = extractTextOperators(raw);
      const parts = text ? [text] : [];
      for (const stream of inflateStreams(raw, rawBuffer)) {
        const t = extractTextOperators(stream);
        if (t) parts.push(t);
      }
      return { text: parts.join('\n'), pages: pages || (parts.length ? 1 : 0) };
    },
  };
}

/**
 * pdf-parse (opcional) — resolve ToUnicode/CID; ausente → fallback regex.
 * Importa lib/pdf-parse.js direto: o index.js do pacote roda um harness de
 * debug que quebra ao ser importado como entry point. No exe SEA o pacote
 * mora no runtime sidecar (`career-runtime/node_modules`).
 */
async function tryPdfParse(buf: Buffer): Promise<{ text: string; pages: number } | null> {
  const requires = [createRequire(__filename)];
  const rt = runtimeDir();
  if (rt) requires.push(createRequire(join(rt, 'runtime-marker.cjs')));
  for (const req of requires) {
    try {
      const pdfParse = req('pdf-parse/lib/pdf-parse.js') as (
        b: Buffer,
      ) => Promise<{ text: string; numpages: number }>;
      const res = await pdfParse(buf);
      const text = res.text?.trim() ?? '';
      if (text) return { text, pages: res.numpages };
    } catch {
      // pacote ausente neste candidato — tenta o próximo
    }
  }
  return null;
}

/** Varre blocos `stream ... endstream` e infla os FlateDecode. */
function* inflateStreams(raw: string, buf: Buffer): Generator<string> {
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end === -1) break;
    const stream = buf.subarray(start, end);
    try {
      yield inflateSync(stream).toString('latin1');
    } catch {
      // stream não-flate (imagem, binário) — ignora
    }
    re.lastIndex = end + 'endstream'.length;
  }
}

function extractTextOperators(raw: string): string {
  const parts: string[] = [];
  const literal = /\((?:\\.|[^\\()])*\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = literal.exec(raw)) !== null) {
    parts.push(unescapePdf(m[0].slice(1, m[0].lastIndexOf(')'))));
  }
  // Item TJ = paren-string | número; itens separados por \s+ obrigatório.
  // Sem o separador, uma sequência longa de dígitos tem decomposições
  // exponenciais em (x)+ — backtracking infinito em PDFs reais.
  const item = String.raw`\((?:\\.|[^\\()])*\)|-?\d+(?:\.\d+)?`;
  const arrayOp = new RegExp(`\\[((?:${item})(?:\\s+${item})*)\\]\\s*TJ`, 'g');
  while ((m = arrayOp.exec(raw)) !== null) {
    const inner = m[1].match(/\((?:\\.|[^\\()])*\)/g) ?? [];
    parts.push(inner.map((s) => unescapePdf(s.slice(1, -1))).join(''));
  }
  return parts.join('\n');
}

function unescapePdf(s: string): string {
  return s.replace(/\\([nrtbf\\()])/g, (_all, c: string) => {
    const map: Record<string, string> = {
      n: '\n',
      r: '\r',
      t: '\t',
      b: '\b',
      f: '\f',
      '\\': '\\',
      '(': '(',
      ')': ')',
    };
    return map[c] ?? c;
  });
}
