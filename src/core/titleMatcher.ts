import { cosine } from '../ai/rag/profileRetriever';

/**
 * Match aproximado de títulos de vaga (JOB_TITLES): títulos reais variam —
 * "Full Stack", "fullstack", "Full-Stack", "fullmstack" (typo), "Fullstack Dev",
 * "Software Engineer" (≈ "Desenvolvedor"), "Dev Backend".
 * Estratégia determinística, em ordem de confiança:
 *   1. 'squashed' (sem espaços/pontuação/acento) — substring em qualquer direção
 *   2. canonical + exact (aliases PT↔EN: dev/engenheiro/engineer → 'dev'…)
 *   3. containment de tokens DISTINTIVOS — genéricos (dev, senior, junior…) não
 *      contam; exige que todo token específico do alvo esteja na vaga
 *      ("Backend Developer" ≠ "Frontend Developer" porque 'backend' falta)
 *   4. Levenshtein proporcional na forma squashed — desligado p/ títulos
 *      curtos (<6 chars) onde ≤2 de distância casaria demais
 */

/** Tokens sem sinal semântico próprio — não decidem match sozinhos. */
const GENERIC_TOKENS = new Set([
  'dev',
  'senior',
  'junior',
  'mid',
  'lead',
  'staff',
  'principal',
  'software',
  'de',
  'da',
  'do',
  'e',
  'of',
  'the',
  'for',
]);

/** Aliases PT↔EN/abreviações → token canônico (remove falso-negativo por sinônimo). */
const ALIASES: Record<string, string> = {
  dev: 'dev',
  developer: 'dev',
  desenvolvedor: 'dev',
  engineer: 'dev',
  engenheiro: 'dev',
  eng: 'dev',
  senior: 'senior',
  sr: 'senior',
  pleno: 'mid',
  mid: 'mid',
  junior: 'junior',
  jr: 'junior',
  backend: 'backend',
  'back-end': 'backend',
  frontend: 'frontend',
  'front-end': 'frontend',
  fullstack: 'fullstack',
  'full-stack': 'fullstack',
};

/** Minúsculas, sem acento, sem pontuação, espaços colapsados, tokens canonizados. */
export function normalizeTitle(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonTokens(s: string): string[] {
  return normalizeTitle(s)
    .split(' ')
    .filter(Boolean)
    .map((t) => ALIASES[t] ?? t);
}

const squash = (s: string): string => canonTokens(s).join('');
const canonical = (s: string): string => canonTokens(s).join(' ');
const distinctiveTokens = (s: string): Set<string> =>
  new Set(canonTokens(s).filter((t) => !GENERIC_TOKENS.has(t)));

/** Levenshtein clássico com corte antecipado por diferença de tamanho. */
export function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev.splice(0, prev.length, ...curr);
  }
  return prev[b.length];
}

export interface TitleMatch {
  /** Título-alvo (de JOB_TITLES) que casou. */
  target: string;
  /** Nível de confiança do match, do mais ao menos forte. */
  strength: 'exact' | 'squashed' | 'containment' | 'levenshtein' | 'semantic';
  /** Cosine similarity — só presente em matches 'semantic'. */
  score?: number;
}

const MIN_LEVENSHTEIN_LEN = 6;
/** Distância máxima proporcional ao tamanho do alvo (~1 typo a cada 5 chars). */
const maxDistance = (len: number) => Math.max(1, Math.floor(len / 5));

/**
 * Retorna o melhor match contra a lista de alvos, ou null.
 * Containment exige ≥1 token distintivo no alvo — alvo todo-genérico
 * ("Software Engineer") cai para Levenshtein/squashed.
 */
export function matchTargetTitle(jobTitle: string, targetTitles: string[]): TitleMatch | null {
  if (!jobTitle.trim() || !targetTitles.length) return null;
  const nj = normalizeTitle(jobTitle);
  const cj = canonical(jobTitle);
  const sj = squash(jobTitle);
  const dj = distinctiveTokens(jobTitle);

  for (const target of targetTitles) {
    if (normalizeTitle(target) === nj || canonical(target) === cj) {
      return { target, strength: 'exact' };
    }
  }
  for (const target of targetTitles) {
    const st = squash(target);
    // vaga ⊇ alvo: ruído de sufixo/prefixo é seguro a partir de 4 chars;
    // vaga ⊆ alvo: exige título mínimo senão "Dev" casaria com "DevOps".
    if (st.length >= 4 && (sj.includes(st) || (sj.length >= 6 && st.includes(sj)))) {
      return { target, strength: 'squashed' };
    }
  }
  for (const target of targetTitles) {
    const dt = distinctiveTokens(target);
    if (dt.size && [...dt].every((t) => dj.has(t))) {
      return { target, strength: 'containment' };
    }
  }
  for (const target of targetTitles) {
    const st = squash(target);
    if (st.length >= MIN_LEVENSHTEIN_LEN && levenshtein(sj, st) <= maxDistance(st.length)) {
      return { target, strength: 'levenshtein' };
    }
  }
  return null;
}

/**
 * Camada probabilística (AI_EMBEDDINGS_ENABLED): cosine similarity entre o
 * título da vaga e cada alvo via embeddings (ex.: nomic-embed-text).
 * Resolve o que aliases não cobrem — "JS Developer", "React Frontend Dev",
 * "Programador Web" — sem hardcoding de sinônimos.
 *
 * Vetores dos alvos são cacheados na primeira chamada: N vagas = N+1 embeds,
 * não N×(1+|alvos|). Falha do embedder → null (o determinístico já rodou).
 */
export const SEMANTIC_THRESHOLD = 0.72;

export interface TitleEmbedder {
  embed(texts: string[]): Promise<number[][]>;
}

export function createSemanticTitleMatcher(
  targetTitles: string[],
  embedder: TitleEmbedder | undefined,
  opts: { threshold?: number } = {},
): (jobTitle: string) => Promise<TitleMatch | null> {
  const threshold = opts.threshold ?? SEMANTIC_THRESHOLD;
  let targetVecs: number[][] | null = null;

  return async (jobTitle: string): Promise<TitleMatch | null> => {
    const det = matchTargetTitle(jobTitle, targetTitles);
    // Determinístico forte decide sozinho — embedder nem é chamado.
    if (det && (det.strength === 'exact' || det.strength === 'squashed')) return det;
    if (!embedder || !jobTitle.trim()) return det;

    try {
      targetVecs ??= await embedder.embed(targetTitles);
      const [jobVec] = await embedder.embed([jobTitle]);
      if (!jobVec || !targetVecs.length) return det;

      let best = -1;
      let bestIdx = -1;
      for (let i = 0; i < targetTitles.length; i++) {
        const s = cosine(jobVec, targetVecs[i] ?? []);
        if (s > best) {
          best = s;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0 && best >= threshold) {
        return { target: targetTitles[bestIdx]!, strength: 'semantic', score: best };
      }
      return det; // sem match semântico — vale o que o determinístico achou
    } catch {
      return det;
    }
  };
}
