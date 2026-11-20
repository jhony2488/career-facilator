import type { MasterProfileLike } from './types';

/**
 * Aderência léxica da Camada 0 (doc 01 §TF-IDF/BM25): filtro determinístico
 * executado ANTES da triagem de IA — corta vagas sem overlap de stack sem
 * gastar um único token de inferência.
 *
 * Score simples e estável: quantidade de termos do perfil encontrados no texto
 * da vaga (exact + prefixo ≥4 letras), normalizado pela quantidade de termos.
 */

export interface LexicalFit {
  /** termos do perfil encontrados na vaga */
  matchedTerms: string[];
  /** 0..1 — cobertura dos termos do perfil na vaga */
  coverage: number;
  /** hits brutos (frequência somada) — desempate/ranking */
  hits: number;
}

const STOPWORDS = new Set([
  'de', 'do', 'da', 'em', 'para', 'com', 'a', 'o', 'e', 'or', 'and', 'the',
  'in', 'of', 'to', 'for', 'with', 'on',
]);

function norm(t: string): string {
  return t.toLowerCase().trim();
}

/** Termos de fit vindos do perfil: coreStack + títulos das experiências (se houver). */
export function profileFitTerms(profile: MasterProfileLike & { experiences?: { role: string }[] }): string[] {
  const terms = new Set<string>();
  for (const s of profile.coreStack) terms.add(norm(s));
  for (const e of profile.experiences ?? []) {
    for (const w of e.role.split(/\s+/)) {
      const t = norm(w);
      if (t.length >= 4 && !STOPWORDS.has(t)) terms.add(t);
    }
  }
  for (const p of profile.projects) {
    for (const w of p.name.split(/\s+/)) {
      const t = norm(w);
      if (t.length >= 4 && !STOPWORDS.has(t)) terms.add(t);
    }
  }
  return [...terms];
}

export function computeLexicalFit(jobText: string, terms: string[]): LexicalFit {
  const haystack = jobText.toLowerCase();
  const matchedTerms: string[] = [];
  let hits = 0;

  for (const term of terms) {
    let found = false;
    let idx = 0;
    for (;;) {
      const at = haystack.indexOf(term, idx);
      if (at === -1) break;
      found = true;
      hits++;
      idx = at + term.length;
    }
    if (!found && term.length >= 4) {
      // prefixo do termo (ex.: "typescript" casa com "typescripts") ou termo contém palavra da vaga
      if (haystack.includes(term.slice(0, -1))) found = true;
    }
    if (found) matchedTerms.push(term);
  }

  const coverage = terms.length ? matchedTerms.length / terms.length : 0;
  return { matchedTerms, coverage, hits };
}
