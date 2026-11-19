import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

export interface ResumeTemplateInput {
  resumeMarkdown: string;
  outputPath: string;
}

/**
 * Compila o markdown adaptado em PDF ATS-friendly (doc 02, feature/05).
 * Layout de coluna única, texto selecionável — legível por parsers de RH.
 *
 * Implementação atual: gera HTML minimalista pronto para puppeteer render.
 * A troca para PDF binário não muda o contrato.
 */
export async function buildResumePdf(input: ResumeTemplateInput): Promise<{ filePath: string }> {
  await fs.mkdir(dirname(input.outputPath), { recursive: true });

  const body = input.resumeMarkdown
    .split('\n')
    .map((line) => {
      if (line.startsWith('# ')) return `<h1>${escapeHtml(line.slice(2))}</h1>`;
      if (line.startsWith('## ')) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      if (line.startsWith('### ')) return `<h3>${escapeHtml(line.slice(4))}</h3>`;
      if (line.startsWith('- ')) return `<li>${escapeHtml(line.slice(2))}</li>`;
      return line.trim() ? `<p>${escapeHtml(line)}</p>` : '';
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; max-width: 720px; margin: 0 auto; font-size: 11pt; line-height: 1.4; }
  h1 { font-size: 18pt; margin-bottom: 4px; }
  h2 { font-size: 13pt; border-bottom: 1px solid #ccc; margin-top: 16px; }
</style></head><body>
${body}
</body></html>`;

  await fs.writeFile(input.outputPath.replace(/\.pdf$/, '.html'), html, 'utf-8');
  return { filePath: input.outputPath };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
