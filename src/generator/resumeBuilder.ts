import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import type { MasterProfileLike } from '../core/types';
import { paginateMarkdown, writeSimplePdf } from './pdfWriter';

export interface ResumeTemplateInput {
  resumeMarkdown: string;
  outputPath: string;
}

/**
 * Markdown de emergência a partir do perfil compilado — usado quando o modelo
 * não devolve resumeMarkdown. Anti-fabricação: só campos do perfil-mestre.
 */
export function fallbackResumeMarkdown(profile: MasterProfileLike): string {
  const projects = (profile.projects ?? [])
    .map(
      (p) =>
        `### ${p.name}\n${p.summary}${p.metrics?.length ? `\n${p.metrics.map((m) => `- ${m}`).join('\n')}` : ''}`,
    )
    .join('\n\n');
  return [
    `# ${profile.fullName}`,
    `${profile.email} · ${profile.phone}`,
    [profile.linkedin, profile.github, profile.portfolio].filter(Boolean).join(' · '),
    `## Stack`,
    (profile.coreStack ?? []).join(', '),
    `## Experiência`,
    `${profile.seniorityYears} anos de experiência.`,
    projects ? `## Projetos\n${projects}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Compila o markdown adaptado em PDF ATS-friendly real (doc 02, feature/05):
 * coluna única, texto selecionável, fontes base-14 — legível por parsers de RH.
 *
 * Implementação: escritor PDF interno (pdfWriter) — sem deps nativas nem
 * Chromium, funciona também no binário CLI-solto sem career-runtime. A troca
 * para render Playwright não muda o contrato.
 */
export async function buildResumePdf(input: ResumeTemplateInput): Promise<{ filePath: string }> {
  await fs.mkdir(dirname(input.outputPath), { recursive: true });
  const pages = paginateMarkdown(input.resumeMarkdown.trim() || '# —');
  const pdf = writeSimplePdf(pages.length ? pages : [[{ text: '—', size: 11, bold: false }]]);
  await fs.writeFile(input.outputPath, pdf);
  return { filePath: input.outputPath };
}
