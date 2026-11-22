import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolveHome } from '../config/paths';

/**
 * Respostas do tailor persistidas em sidecar (`<resume>.answers.json`) — o
 * retry reaproveita as respostas de IA geradas no run em vez de deixar os
 * mesmos campos em branco (decisão #30). Sem coluna nova no sqlite.
 */
export function answersPath(resumePath: string): string {
  return `${resolveHome(resumePath)}.answers.json`;
}

/** Grava as respostas do tailor ao lado do CV gerado. Falha = silenciosa. */
export function writeAnswers(resumePath: string, answers: Record<string, string>): void {
  try {
    writeFileSync(answersPath(resumePath), JSON.stringify(answers, null, 2), 'utf8');
  } catch {
    // storage inacessível — o retry cai no fallback de respostas vazias
  }
}

/** Lê o sidecar; arquivo ausente/corrompido → {}. */
export function readAnswers(resumePath: string | null | undefined): Record<string, string> {
  if (!resumePath) return {};
  try {
    const raw = readFileSync(answersPath(resumePath), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // sem sidecar (job legado ou tailor ainda não rodou) — respostas vazias
  }
  return {};
}

/** Limpa o sidecar junto com a remoção do job do histórico. */
export function removeAnswers(resumePath: string | null | undefined): void {
  if (!resumePath) return;
  try {
    const p = answersPath(resumePath);
    if (existsSync(p)) unlinkSync(p);
  } catch {
    // best-effort
  }
}
