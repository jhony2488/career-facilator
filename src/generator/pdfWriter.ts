/**
 * Escritor PDF mínimo em JS puro — PDF 1.4, Helvetica/Helvetica-Bold (base-14,
 * sem embed), streams de texto `Tj` por linha, multi-página, single-column.
 *
 * Por que não Playwright/page.pdf(): o binário CLI-solto não carrega o runtime
 * (chromium). Este writer gera PDF real com camada de texto — parseável por
 * ATS — em qualquer modo de execução. Coluna única, sem imagem/tabela.
 *
 * Encoding: WinAnsi. Chars >0xFF caem para '?' (ASCII-safe); latins-1 viram
 * byte direto no stream (acentos pt-BR preservados).
 */

export interface PdfLine {
  text: string;
  size: number;
  bold: boolean;
  /** espaço extra acima da linha (pt). */
  gapBefore?: number;
  /** recuo à esquerda (pt). */
  indent?: number;
}

const PAGE_W = 595.28; // A4 pt
const PAGE_H = 841.89;
const MARGIN = 50;
const TOP = PAGE_H - MARGIN;
const BOTTOM = MARGIN;
const LINE_H = 14;
const MAX_CHARS = 92; // ~largura útil a 11pt (coluna única — ATS-safe)

type Style = 'title' | 'h2' | 'h3' | 'body' | 'bullet';
const STYLE: Record<Style, { size: number; bold: boolean; gap: number; indent: number }> = {
  title: { size: 16, bold: true, gap: 0, indent: 0 },
  h2: { size: 13, bold: true, gap: 10, indent: 0 },
  h3: { size: 11, bold: true, gap: 6, indent: 0 },
  body: { size: 10.5, bold: false, gap: 0, indent: 0 },
  bullet: { size: 10.5, bold: false, gap: 0, indent: 12 },
};

function wrap(text: string, indent = 0): string[] {
  const max = MAX_CHARS - Math.floor(indent / 5);
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && cur.length + w.length + 1 > max) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/**
 * Renderiza o markdown adaptado em linhas paginadas, preservando hierarquia
 * de seções (#/##/###, bullets, blank lines) — layout de coluna única p/ ATS.
 */
export function paginateMarkdown(md: string): PdfLine[][] {
  const lines: PdfLine[] = [];
  let prevGap = 0;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      prevGap = Math.min(prevGap + 8, 18);
      continue;
    }
    let style: Style = 'body';
    let text = line;
    if (line.startsWith('### ')) {
      style = 'h3';
      text = line.slice(4);
    } else if (line.startsWith('## ')) {
      style = 'h2';
      text = line.slice(3);
    } else if (line.startsWith('# ')) {
      style = 'title';
      text = line.slice(2);
    } else if (/^[-*•]\s+/.test(line)) {
      style = 'bullet';
      text = `• ${line.replace(/^[-*•]\s+/, '')}`;
    }
    const st = STYLE[style];
    const wrapped = wrap(text, st.indent);
    wrapped.forEach((w, i) => {
      lines.push({
        text: w,
        size: st.size,
        bold: st.bold,
        indent: st.indent,
        gapBefore: i === 0 ? st.gap + prevGap : 0,
      });
      prevGap = 0;
    });
  }

  const pages: PdfLine[][] = [[]];
  let y = TOP;
  for (const l of lines) {
    const need = l.size + (l.gapBefore ?? 0);
    if (y - need < BOTTOM && pages[pages.length - 1].length) {
      pages.push([]);
      y = TOP;
    }
    pages[pages.length - 1].push(l);
    y -= l.size + (l.gapBefore ?? 0);
  }
  return pages;
}

/** Escapa string p/ literal PDF (latin-1 → octal-safe em ASCII). */
function escPdf(text: string): string {
  let out = '';
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c === 40 || c === 41 || c === 92) out += `\\${String.fromCharCode(c)}`;
    else if (c > 0xff) out += '?';
    else out += String.fromCharCode(c);
  }
  return out;
}

/**
 * Serializa páginas em PDF 1.4 mínimo válido. Retorna Buffer com o arquivo.
 * Objetos: 1 catalog, 2 pages, 3/4 fontes, depois (page, content) por página.
 */
export function writeSimplePdf(pages: PdfLine[][]): Buffer {
  const objs: Buffer[] = [];
  const fonts = `<< /F1 ${3} 0 R /F2 ${4} 0 R >>`;
  objs[0] = Buffer.from(`<< /Type /Catalog /Pages 2 0 R >>`, 'latin1');
  const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ');
  objs[1] = Buffer.from(`<< /Type /Pages /Kids [ ${kids} ] /Count ${pages.length} >>`, 'latin1');
  objs[2] = Buffer.from(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`, 'latin1');
  objs[3] = Buffer.from(
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`,
    'latin1',
  );
  pages.forEach((lines, i) => {
    const pageObj = 5 + i * 2;
    const contentObj = pageObj + 1;
    let content = '';
    let y = TOP;
    for (const l of lines) {
      y -= l.gapBefore ?? 0;
      const font = l.bold ? 'F2' : 'F1';
      const x = MARGIN + (l.indent ?? 0);
      content += `BT /${font} ${l.size} Tf 1 0 0 1 ${x} ${y.toFixed(2)} Tm (${escPdf(
        l.text,
      )}) Tj ET\n`;
      y -= l.size + LINE_H * 0.15;
    }
    objs[pageObj - 1] = Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font ${fonts} >> /Contents ${contentObj} 0 R >>`,
      'latin1',
    );
    const stream = Buffer.from(content, 'latin1');
    objs[contentObj - 1] = Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'latin1'),
      stream,
      Buffer.from(`endstream`, 'latin1'),
    ]);
  });

  const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1');
  const parts: Buffer[] = [header];
  const offsets: number[] = [0];
  let pos = header.length;
  objs.forEach((body, i) => {
    const objHeader = Buffer.from(`${i + 1} 0 obj\n`, 'latin1');
    const objFooter = Buffer.from('\nendobj\n', 'latin1');
    offsets.push(pos);
    parts.push(objHeader, body, objFooter);
    pos += objHeader.length + body.length + objFooter.length;
  });
  const xrefStart = pos;
  const count = objs.length + 1;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (const o of offsets.slice(1)) xref += `${o.toString().padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(parts);
}
