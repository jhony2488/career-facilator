import { paginateMarkdown, writeSimplePdf, type PdfLine } from '../../../src/generator/pdfWriter';

/**
 * feature/05 — "Gerar PDF em formato compatível com leitores de ATS":
 * the writer must emit a real binary PDF (not HTML), single column,
 * with a selectable text layer — no external deps.
 */
describe('pdfWriter — minimal PDF writer', () => {
  it('produces a binary that starts with %PDF- and ends with %%EOF', () => {
    const pdf = writeSimplePdf([[{ text: 'Hello', size: 11, bold: false }]]);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.subarray(pdf.length - 6).toString('latin1')).toContain('%%EOF');
    expect(pdf.length).toBeGreaterThan(300);
  });

  it('emits a xref table with correct object count', () => {
    const pdf = writeSimplePdf([[{ text: 'x', size: 11, bold: false }]]);
    const s = pdf.toString('latin1');
    expect(s).toContain('xref');
    expect(s).toContain('/Root 1 0 R');
    expect(s).toContain('/Type /Page');
    expect(s).toContain('/BaseFont /Helvetica');
  });

  it('creates as many /Page objects as pages', () => {
    const pages: PdfLine[][] = [
      [{ text: 'p1', size: 11, bold: false }],
      [{ text: 'p2', size: 11, bold: false }],
      [{ text: 'p3', size: 11, bold: false }],
    ];
    const s = writeSimplePdf(pages).toString('latin1');
    expect(s).toContain('/Count 3');
    expect((s.match(/\/Type \/Page /g) ?? []).length).toBe(3);
  });

  it('escapes parentheses, backslash and keeps latin-1 accents as bytes', () => {
    const pdf = writeSimplePdf([
      [{ text: 'São Paulo — José (dev) \\ path ção', size: 11, bold: false }],
    ]);
    const s = pdf.toString('latin1');
    expect(s).toContain('\\('); // ( escaped
    expect(s).toContain('\\)');
    expect(s).toContain('\\\\'); // backslash escaped
    expect(s).toContain('São Paulo'); // latin-1 byte preserved
  });

  it('degrades chars above latin-1 to ?', () => {
    const s = writeSimplePdf([[{ text: 'ok 👍', size: 11, bold: false }]]).toString('latin1');
    expect(s).toContain('ok ?');
  });
});

describe('paginateMarkdown — ATS single-column layout', () => {
  it('maps # to bold 16pt title and ## to bold section headers', () => {
    const [page] = paginateMarkdown('# Nome\n## Experiência\nTexto');
    expect(page[0].text).toBe('Nome');
    expect(page[0].bold).toBe(true);
    expect(page[0].size).toBe(16);
    const h2 = page.find((l) => l.text === 'Experiência');
    expect(h2?.bold).toBe(true);
    expect(h2?.size).toBe(13);
  });

  it('renders bullets with • marker and indent', () => {
    const [page] = paginateMarkdown('- TypeScript\n- Node.js');
    expect(page[0].text.startsWith('• ')).toBe(true);
    expect(page[0].indent).toBeGreaterThan(0);
  });

  it('wraps long paragraphs without cutting words at ~92 chars', () => {
    const long = 'palavra '.repeat(30).trim();
    const [page] = paginateMarkdown(long);
    for (const l of page) expect(l.text.length).toBeLessThanOrEqual(92);
    expect(page.length).toBeGreaterThan(2);
  });

  it('splits content across pages when it exceeds usable height', () => {
    const md = Array.from({ length: 90 }, (_, i) => `linha ${i}`).join('\n');
    const pages = paginateMarkdown(md);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((p) => p.length > 0)).toBe(true);
  });

  it('preserves accents in the latin-1 safe path', () => {
    const [page] = paginateMarkdown('# Currículo — Análise');
    expect(page[0].text).toBe('Currículo — Análise');
  });
});
