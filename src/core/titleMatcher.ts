/**
 * Match aproximado de títulos de vaga (JOB_TITLES): títulos reais variam —
 * "Full Stack", "fullstack", "Full-Stack", "fullmstack" (typo), "Fullstack Dev".
 * Estratégia determinística, em ordem de custo:
 *   1. normalização + igualdade exata
 *   2. 'squashed' (sem espaços/pontuação) — substring em qualquer direção
 *   3. Jaccard de tokens ≥ 0.6 (ordem/ruído tolerados)
 *   4. Levenshtein ≤ 2 na forma squashed (typos de 1-2 chars)
 */

/** Minúsculas, sem acento, sem pontuação, espaços colapsados. */
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

const squash = (s: string): string => normalizeTitle(s).replace(/\s+/g, '');
const tokens = (s: string): Set<string> => new Set(normalizeTitle(s).split(' ').filter(Boolean));

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Levenshtein clássico — barato o suficiente p/ strings < 30 chars. */
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
  /** Nível de confiança do match. */
  strength: 'exact' | 'squashed' | 'jaccard' | 'levenshtein';
}

/** Retorna o melhor match contra a lista de alvos, ou null. */
export function matchTargetTitle(
  jobTitle: string,
  targetTitles: string[],
): TitleMatch | null {
  if (!jobTitle.trim() || !targetTitles.length) return null;
  const nj = normalizeTitle(jobTitle);
  const sj = squash(jobTitle);
  const tj = tokens(jobTitle);

  for (const target of targetTitles) {
    if (normalizeTitle(target) === nj) return { target, strength: 'exact' };
  }
  for (const target of targetTitles) {
    const st = squash(target);
    if (st.length >= 4 && (sj.includes(st) || st.includes(sj))) {
      return { target, strength: 'squashed' };
    }
  }
  let best: TitleMatch | null = null;
  for (const target of targetTitles) {
    if (jaccard(tj, tokens(target)) >= 0.6) {
      best = { target, strength: 'jaccard' };
      break;
    }
    if (levenshtein(sj, squash(target)) <= 2) {
      best = { target, strength: 'levenshtein' };
      break;
    }
  }
  return best;
}
