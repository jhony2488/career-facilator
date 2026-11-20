import type { CareerOpsConfig } from '../config/careerOps.config';

/**
 * Pretensão salarial por nível + adaptação à faixa da vaga:
 *  - detectSeniorityLevel: nível pelo título/texto (junior/pleno/senior)
 *  - parseSalaryRange: extrai faixa "R$ 8.000 – 12.000" / "$5k–$7k" do texto
 *  - resolveSalaryExpectation: pretensão do nível detectado; se a faixa da
 *    vaga paga menos que a pretensão, estipula o teto da faixa (config
 *    salary.adaptToJobRange). Nunca infla acima da pretensão base.
 */

export type SeniorityLevel = 'JUNIOR' | 'PLENO' | 'SENIOR';

export function detectSeniorityLevel(jobTitle: string, jobText = ''): SeniorityLevel | null {
  const hay = `${jobTitle} ${jobText.slice(0, 300)}`.toLowerCase();
  if (/\b(senior|sênior|sr\b|lead|staff|principal|especialista|specialist)\b/.test(hay)) {
    return 'SENIOR';
  }
  if (/\b(pleno|mid[- ]?level|pl\b)\b/.test(hay)) return 'PLENO';
  if (/\b(junior|júnior|jr\b|trainee|entry[- ]?level|estagiário|intern)\b/.test(hay)) {
    return 'JUNIOR';
  }
  return null;
}

export interface SalaryRange {
  min: number;
  max: number;
  currency: 'BRL' | 'USD';
}

const NUM = String.raw`[\d]+(?:[.,]\d{3})*(?:[.,]\d{1,2})?`;
/** "12k"/"12 mil" → 12000; "10.000" → 10000; "10,50" → 10.5 */
function parseAmount(raw: string, mult: string | undefined): number {
  const m = (mult ?? '').toLowerCase();
  let s = raw;
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else s = s.replace(',', '.');
  let v = parseFloat(s);
  if (!Number.isFinite(v)) return 0;
  if (m === 'k' || m === 'mil') v *= 1000;
  return Math.round(v);
}

/** Encontra a faixa salarial da vaga na moeda pedida (min/max de todos os valores citados). */
export function parseSalaryRange(text: string, currency: 'BRL' | 'USD'): SalaryRange | null {
  const re =
    currency === 'BRL'
      ? new RegExp(String.raw`(?:R\$|BRL)\s*(${NUM})\s*(mil|k)?`, 'gi')
      : new RegExp(String.raw`(?:US\$|USD|\$)\s*(${NUM})\s*(k)?`, 'gi');
  const values: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const v = parseAmount(m[1]!, m[2]);
    if (v >= 500) values.push(v); // descarta ruído tipo "R$ 50 de benefício"
  }
  if (!values.length) return null;
  return { min: Math.min(...values), max: Math.max(...values), currency };
}

export interface SalaryResolution {
  /** Valor a estampar na mensagem/campo. */
  value: number;
  /** Nível detectado na vaga (null → pretensão default do mercado). */
  level: SeniorityLevel | null;
  /** true quando a faixa da vaga forçou ajuste. */
  adaptedToRange: boolean;
  range?: SalaryRange;
}

export function resolveSalaryExpectation(
  input: {
    jobTitle: string;
    jobText: string;
    currency: 'BRL' | 'USD';
  },
  config: CareerOpsConfig,
): SalaryResolution {
  const level = detectSeniorityLevel(input.jobTitle, input.jobText);
  const key = input.currency === 'BRL' ? 'brl' : 'usd';
  const base = level
    ? config.salary.byLevel[level][key]
    : input.currency === 'BRL'
      ? config.marketScope.national.salaryExpectationBRL
      : config.marketScope.international.salaryExpectationUSD;

  const range = parseSalaryRange(input.jobText, input.currency);
  if (config.salary.adaptToJobRange && range && base > range.max) {
    return { value: range.max, level, adaptedToRange: true, range };
  }
  return { value: base, level, adaptedToRange: false, ...(range ? { range } : {}) };
}
