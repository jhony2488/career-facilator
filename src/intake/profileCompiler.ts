import type { MasterProfile, SalaryByLevel } from './masterProfile';
import { NOT_INFORMED } from './profileStructurer';
import { invalidateProfileCache } from '../ai/tailorerAgent';

export interface CompileResult {
  profile: MasterProfile;
  warnings: string[];
}

export interface ProfileInvalidation {
  cacheInvalidated: boolean;
  scoresToRecalculate: boolean;
}

const KNOWN_SECTIONS = new Set([
  'dados pessoais',
  'resumo',
  'experiências',
  'experiencias',
  'projetos',
  'projetos open source',
  'open source',
  'habilidades',
  'formação',
  'formacao',
  'respostas padrão',
  'respostas padrao',
  'pretensão salarial',
  'pretensao salarial',
]);

const clean = (v: string | undefined): string => {
  const t = (v ?? '').trim();
  return t === '' || t === '_NÃO_INFORMADO_' || t === NOT_INFORMED ? NOT_INFORMED : t;
};

/**
 * Compila o profile.master.md (doc 13 §13.4) na estrutura tipada usada no
 * cache de prompt. Seções fora do padrão geram warnings — o compilador nunca
 * "corrige" inventando conteúdo.
 */
export function compileMasterProfile(markdown: string): CompileResult {
  const warnings: string[] = [];

  for (const line of markdown.split('\n')) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2 && !KNOWN_SECTIONS.has(h2[1].trim().toLowerCase())) {
      warnings.push(`Seção fora do padrão: "${h2[1].trim()}"`);
    }
  }

  const personal = parseKeyValueBullets(section(markdown, /## Dados Pessoais/i));
  const skillsBullets = parseKeyValueBullets(section(markdown, /## Habilidades/i));
  const answers = parseKeyValueBullets(section(markdown, /## Respostas Padrão/i));
  const salarySection = section(markdown, /## Pretens[aã]o Salarial/i);

  const profile: MasterProfile = {
    fullName: clean(markdown.match(/^#\s+(.+)$/m)?.[1]),
    email: clean(personal['e-mail'] ?? personal['email']),
    phone: clean(personal['telefone'] ?? personal['phone']),
    linkedin: clean(personal['linkedin']),
    github: clean(personal['github']),
    portfolio: clean(personal['portfólio'] ?? personal['portfolio']),
    location: clean(personal['localização'] ?? personal['location'] ?? personal['cidade']),
    summary: clean(section(markdown, /## Resumo\b/i).split('\n')[0]),
    seniorityYears: parseNumber(
      skillsBullets['anos de experiência'] ?? skillsBullets['anos de experiencia'],
    ),
    salaryExpectationBRL: parseCurrency(
      personal['pretensão salarial'] ?? personal['pretensao salarial'],
      /r\$\s*([\d.,]+)/i,
    ),
    salaryExpectationUSD: parseCurrency(
      personal['pretensão salarial'] ?? personal['pretensao salarial'],
      /usd\s*([\d.,]+)/i,
    ),
    coreStack: parseCsv(skillsBullets['stacks'] ?? skillsBullets['stack']),
    languages: parseCsv(skillsBullets['idiomas']),
    certifications: parseCsv(skillsBullets['certificações'] ?? skillsBullets['certificacoes']),
    blockedKeywords: parseCsv(skillsBullets['palavras bloqueadas']),
    salaryByLevel: parseSalaryByLevel(salarySection, personal),
    experiences: parseExperiences(section(markdown, /## Experi[êe]ncias/i)),
    projects: parseProjects(section(markdown, /## Projetos(?! Open Source)/i)),
    openSourceProjects: parseOpenSourceProjects(section(markdown, /## (?:Projetos )?Open Source/i)),
    education: parseEducation(section(markdown, /## Forma[çc][ãa]o/i)),
    standardAnswers: answers,
  };

  return { profile, warnings };
}

/** Invalida cache de prompt e sinaliza Fit Scores derivados para recálculo. */
export function invalidateDerivedData(): ProfileInvalidation {
  invalidateProfileCache();
  return { cacheInvalidated: true, scoresToRecalculate: true };
}

// ─── Parsing helpers ────────────────────────────────────────────────────────

function section(md: string, header: RegExp): string {
  const start = md.search(header);
  if (start === -1) return '';
  const fromHeader = md.slice(start);
  const body = fromHeader.replace(/^##[^\n]*\n?/, '');
  const next = body.search(/^## /m);
  return next === -1 ? body.trim() : body.slice(0, next).trim();
}

function parseKeyValueBullets(body: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of body.split('\n')) {
    const m = line.match(/^-\s*([^:]+):\s*(.+)$/);
    if (m) map[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return map;
}

function parseCsv(raw: string | undefined): string[] {
  if (!raw) return [];
  return clean(raw) === NOT_INFORMED
    ? []
    : raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function parseNumber(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function parseCurrency(raw: string | undefined, pattern: RegExp): number {
  if (!raw) return 0;
  const m = raw.match(pattern);
  if (!m) return 0;
  return Number(m[1].replace(/\./g, '').replace(',', '.')) || 0;
}

function parseSalaryByLevel(
  sectionBody: string,
  personal: Record<string, string>,
): SalaryByLevel | undefined {
  // Aceita tanto uma seção dedicada quanto chaves no Dados Pessoais.
  const source = sectionBody || '';
  const lines = source.split('\n').concat(Object.entries(personal).map(([k, v]) => `${k}: ${v}`));
  const entry = (text: string | undefined) => ({
    brl: parseCurrency(text, /r\$\s*([\d.,]+)/i),
    usd: parseCurrency(text, /(?:us\$|usd)\s*([\d.,]+)/i),
  });
  const levelNames = ['junior', 'pleno', 'senior', 'júnior', 'sênior'] as const;
  const levelMap: Record<string, keyof SalaryByLevel> = {
    junior: 'JUNIOR',
    júnior: 'JUNIOR',
    jr: 'JUNIOR',
    pleno: 'PLENO',
    pl: 'PLENO',
    senior: 'SENIOR',
    sênior: 'SENIOR',
    sr: 'SENIOR',
  };
  const found: Partial<SalaryByLevel> = {};
  for (const line of lines) {
    const m = line.match(/^[-\s]*([^:]+):\s*(.+)$/i);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    const value = m[2].trim();
    // Match keys like "salário júnior" or "júnior: R$ 8.000 | USD 1.500".
    const direct = levelMap[key];
    if (direct) {
      found[direct] = entry(value);
      continue;
    }
    for (const name of levelNames) {
      if (key.includes(name)) {
        const mapped = levelMap[name];
        if (mapped && !found[mapped]) found[mapped] = entry(value);
      }
    }
  }
  if (found.JUNIOR || found.PLENO || found.SENIOR) {
    return {
      JUNIOR: found.JUNIOR ?? entry(personal['salário júnior'] ?? personal['salario junior']),
      PLENO: found.PLENO ?? entry(personal['salário pleno'] ?? personal['salario pleno']),
      SENIOR: found.SENIOR ?? entry(personal['salário sênior'] ?? personal['salario senior']),
    };
  }
  return undefined;
}

/** `### Role — Company (period)` + bullets de destaque. */
function parseExperiences(body: string): MasterProfile['experiences'] {
  const out: MasterProfile['experiences'] = [];
  let current: MasterProfile['experiences'][number] | undefined;

  for (const line of body.split('\n')) {
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      const m =
        h3[1].match(/^(.*?)\s*—\s*(.*?)\s*\((.*)\)\s*$/) ??
        h3[1].match(/^(.*?)\s*-\s*(.*?)\s*\((.*)\)\s*$/);
      current = m
        ? { role: m[1].trim(), company: m[2].trim(), period: m[3].trim(), highlights: [] }
        : { role: h3[1].trim(), company: NOT_INFORMED, period: NOT_INFORMED, highlights: [] };
      out.push(current);
      continue;
    }
    const bullet = line.match(/^-\s+(.+)$/);
    if (bullet && current && bullet[1] !== '_NÃO_INFORMADO_')
      current.highlights.push(bullet[1].trim());
  }
  return out;
}

/** `### Name` + linha de resumo + bullets de métricas. */
function parseProjects(body: string): MasterProfile['projects'] {
  const out: MasterProfile['projects'] = [];
  let current: MasterProfile['projects'][number] | undefined;

  for (const line of body.split('\n')) {
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      current = { name: h3[1].trim(), summary: NOT_INFORMED, metrics: [] };
      out.push(current);
      continue;
    }
    const bullet = line.match(/^-\s+(.+)$/);
    if (bullet && current) {
      current.metrics.push(bullet[1].trim());
      continue;
    }
    if (current && line.trim() && line.trim() !== '_NÃO_INFORMADO_') {
      current.summary = line.trim();
    }
  }
  return out;
}

/** `### Name` + `- Repo: url` + linha de resumo + bullets de métricas. */
function parseOpenSourceProjects(body: string): MasterProfile['openSourceProjects'] {
  const out: MasterProfile['openSourceProjects'] = [];
  let current: MasterProfile['openSourceProjects'][number] | undefined;

  for (const line of body.split('\n')) {
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      current = { name: h3[1].trim(), repo: NOT_INFORMED, summary: NOT_INFORMED, metrics: [] };
      out.push(current);
      continue;
    }
    const bullet = line.match(/^-\s+(.+)$/);
    if (bullet && current) {
      const repoMatch = bullet[1].match(/^repo:\s*(.+)$/i);
      if (repoMatch) {
        current.repo = repoMatch[1].trim();
      } else {
        current.metrics.push(bullet[1].trim());
      }
      continue;
    }
    if (current && line.trim() && line.trim() !== '_NÃO_INFORMADO_') {
      current.summary = line.trim();
    }
  }
  return out;
}

/** `- Course — Institution (period)` */
function parseEducation(body: string): MasterProfile['education'] {
  const out: MasterProfile['education'] = [];
  for (const line of body.split('\n')) {
    const bullet = line.match(/^-\s+(.+)$/);
    if (!bullet || bullet[1] === '_NÃO_INFORMADO_') continue;
    const m = bullet[1].match(/^(.*?)\s*—\s*(.*?)\s*\((.*)\)\s*$/);
    out.push(
      m
        ? { course: m[1].trim(), institution: m[2].trim(), period: m[3].trim() }
        : { course: bullet[1].trim(), institution: NOT_INFORMED, period: NOT_INFORMED },
    );
  }
  return out;
}
