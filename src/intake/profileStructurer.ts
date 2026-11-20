import { z } from 'zod';
import { zodSchema } from 'ai';

/** Sentinela para campos ausentes no documento — nunca inferidos (doc 13 §13.1). */
export const NOT_INFORMED = 'NÃO_INFORMADO';

export interface ProfileExperience {
  role: string;
  company: string;
  period: string;
  highlights: string[];
}

export interface ProfileProject {
  name: string;
  summary: string;
  metrics: string[];
}

export interface ProfileEducation {
  course: string;
  institution: string;
  period: string;
}

export interface OpenSourceProject {
  name: string;
  repo: string;
  summary: string;
  metrics: string[];
}

/**
 * Schema do perfil extraído/estruturado (feature/13). Campos de texto ausentes
 * vêm como NOT_INFORMED; numéricos ausentes como null — a LLM nunca infere.
 */
export const MasterProfileSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().min(1),
  phone: z.string(),
  linkedin: z.string(),
  github: z.string(),
  portfolio: z.string(),
  location: z.string(),
  summary: z.string(),
  coreStack: z.array(z.string()),
  seniorityYears: z.number().nullable(),
  experiences: z.array(
    z.object({
      role: z.string(),
      company: z.string(),
      period: z.string(),
      highlights: z.array(z.string()),
    }),
  ),
  projects: z.array(
    z.object({
      name: z.string(),
      summary: z.string(),
      metrics: z.array(z.string()),
    }),
  ),
  openSourceProjects: z.array(
    z.object({
      name: z.string(),
      repo: z.string(),
      summary: z.string(),
      metrics: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({
      course: z.string(),
      institution: z.string(),
      period: z.string(),
    }),
  ),
  languages: z.array(z.string()),
  certifications: z.array(z.string()),
  blockedKeywords: z.array(z.string()),
  standardAnswers: z.record(z.string(), z.string()),
  salaryExpectationBRL: z.number().nullable(),
  salaryExpectationUSD: z.number().nullable(),
});

export type ExtractedProfile = z.infer<typeof MasterProfileSchema>;

export interface StructurerModel {
  generate(prompt: string): Promise<ExtractedProfile>;
  /**
   * Opcional — gera objeto PARCIAL validado contra `jsonSchema` (structured
   * output). Caminho preferido: saída mínima por seção, sem placeholders.
   */
  generatePart?(prompt: string, jsonSchema: Record<string, unknown>): Promise<unknown>;
}

/** Perfil vazio — base do rascunho mínimo quando o modelo não está configurado. */
export function makeEmptyProfile(): ExtractedProfile {
  return {
    fullName: NOT_INFORMED,
    email: NOT_INFORMED,
    phone: NOT_INFORMED,
    linkedin: NOT_INFORMED,
    github: NOT_INFORMED,
    portfolio: NOT_INFORMED,
    location: NOT_INFORMED,
    summary: NOT_INFORMED,
    coreStack: [],
    seniorityYears: null,
    experiences: [],
    projects: [],
    openSourceProjects: [],
    education: [],
    languages: [],
    certifications: [],
    blockedKeywords: [],
    standardAnswers: {},
    salaryExpectationBRL: null,
    salaryExpectationUSD: null,
  };
}

const ANTI_FABRICATION_RULE =
  'Extract ONLY what literally appears in the document. ' +
  `For any absent text field return "${NOT_INFORMED}"; for absent numeric fields return null; ` +
  'for absent lists return []. Never infer, guess or complete missing information.';

/**
 * Completude + mapeamento — a falha clássica de modelo pequeno é capturar só
 * o 1º item de cada lista e misturar categorias (linguagem de programação
 * como "idioma", tech como "certificação").
 */
const COMPLETENESS_RULE = [
  'COMPLETENESS (mandatory): enumerate EVERY item of each section —',
  'if the document lists 3 jobs, experiences must have 3 entries; if it lists',
  '4 projects, projects must have 4 entries. Never stop at the first item.',
  'Mapping rules:',
  '- languages = human languages only (e.g. Português, Inglês). Programming',
  '  languages belong in coreStack.',
  '- certifications = real certificates/courses with a title. Technologies,',
  '  frameworks and LLM tools are NOT certifications.',
  '- blockedKeywords = [] unless the document explicitly lists words to avoid.',
  '- standardAnswers = {} always (filled manually later, never from the doc).',
].join('\n');

/** Esqueleto do schema declarado no prompt — modelos pequenos precisam da forma. */
const PROFILE_JSON_SKELETON = [
  'Return a single JSON object with exactly these keys:',
  'fullName, email, phone, linkedin, github, portfolio, location, summary (strings);',
  'coreStack, languages, certifications, blockedKeywords (string arrays);',
  'seniorityYears, salaryExpectationBRL, salaryExpectationUSD (number or null);',
  'experiences: [{role, company, period, highlights: [string]}];',
  'projects: [{name, summary, metrics: [string]}];',
  'openSourceProjects: [{name, repo, summary, metrics: [string]}];',
  'education: [{course, institution, period}];',
  'standardAnswers: {} (string->string map).',
].join('\n');

/** Estrutura o texto do documento via LLM leve + Zod — só o que consta no doc. */
export async function structureProfile(
  input: { documentText: string },
  deps: { model: StructurerModel },
): Promise<ExtractedProfile> {
  const sections = splitCvSections(input.documentText);

  // Seções reconhecidas → uma chamada FOCADA por seção. Com generatePart a
  // saída é só o schema daquela seção (mínima p/ 3B); sem ele, FOCUS no
  // schema completo. Sem seções → chamada única sobre o documento inteiro.
  if (sections) {
    const merged = makeEmptyProfile();
    const header = input.documentText.slice(
      0,
      input.documentText.indexOf(sections.firstHeader),
    );

    interface Part {
      body: string;
      fields: string;
      schema: z.ZodType<Record<string, unknown>>;
      /** Estimativa determinística de itens — nudge no prompt + check de faltantes. */
      expected: number;
    }
    const parts: Part[] = [
      {
        body: header + (sections.summary ?? '') + (sections.skills ?? '') +
          (sections.certifications ?? ''),
        fields:
          'fullName, email, phone, linkedin, github, portfolio, location, summary, ' +
          'seniorityYears, salaryExpectationBRL, salaryExpectationUSD, ' +
          'coreStack, languages, certifications, blockedKeywords',
        schema: z.object({
          fullName: z.string(), email: z.string(), phone: z.string(),
          linkedin: z.string(), github: z.string(), portfolio: z.string(),
          location: z.string(), summary: z.string(),
          seniorityYears: z.number().nullable(),
          salaryExpectationBRL: z.number().nullable(),
          salaryExpectationUSD: z.number().nullable(),
          coreStack: z.array(z.string()), languages: z.array(z.string()),
          certifications: z.array(z.string()), blockedKeywords: z.array(z.string()),
        }),
        expected: 0,
      },
      {
        body: sections.experiences ?? '',
        fields: 'experiences',
        schema: z.object({ experiences: MasterProfileSchema.shape.experiences }),
        expected: countYearLines(sections.experiences ?? ''),
      },
      {
        body: (sections.projects ?? '') + '\n' + (sections.openSource ?? ''),
        fields: 'projects, openSourceProjects',
        schema: z.object({
          projects: MasterProfileSchema.shape.projects,
          openSourceProjects: MasterProfileSchema.shape.openSourceProjects,
        }),
        expected: countTitleLines(
          (sections.projects ?? '') + '\n' + (sections.openSource ?? ''),
        ),
      },
      {
        body: (sections.education ?? '') + '\n' + (sections.languages ?? ''),
        fields: 'education, languages',
        schema: z.object({
          education: MasterProfileSchema.shape.education,
          languages: MasterProfileSchema.shape.languages,
        }),
        expected: countTitleLines(sections.education ?? ''),
      },
    ];

    for (const part of parts) {
      if (!part.body.trim()) continue;
      if (deps.model.generatePart) {
        const raw = await generatePartWithRetry(deps.model, part);
        copyFilledFields(merged, MasterProfileSchema.parse(wrapAsProfile(raw)));
      } else {
        let p = MasterProfileSchema.parse(
          await deps.model.generate(scopedPrompt(part.fields, part.body)),
        );
        if (!hasUsefulContent(p) && part.body.trim().length > 200) {
          p = MasterProfileSchema.parse(
            await deps.model.generate(
              scopedPrompt(part.fields, part.body) +
                '\n\nYour previous attempt returned only placeholders. ' +
                'Read <document> again and extract the real items.',
            ),
          );
        }
        copyFilledFields(merged, p);
      }
    }
    applyDeterministicBackstops(merged, input.documentText, sections);
    return merged;
  }

  const raw = await deps.model.generate(
    [
      ANTI_FABRICATION_RULE,
      '',
      COMPLETENESS_RULE,
      '',
      PROFILE_JSON_SKELETON,
      '',
      '<document>',
      input.documentText,
      '</document>',
    ].join('\n'),
  );
  const parsed = MasterProfileSchema.parse(raw);
  applyDeterministicBackstops(parsed, input.documentText, null);
  return parsed;
}

// ─── Backstops determinísticos — só leem o doc, nunca inventam ───────────────

/** "mais de 6 anos de experiência" / "6+ years of experience" → 6. */
const extractSeniorityYears = (t: string): number | null => {
  const m =
    /(\d{1,2})\s*\+?\s*anos?\s*de experi[êe]ncia/i.exec(t) ??
    /(\d{1,2})\s*\+?\s*years? of experience/i.exec(t);
  return m ? Number(m[1]) : null;
};

/**
 * coreStack por presença literal — cobre seção "COMPETÊNCIAS" vazia no PDF
 * (layout em colunas/ícones que o extrator de texto não captura): as techs
 * estão espalhadas nas experiências e projetos. Lista fechada.
 */
const TECH_LEXICON = [
  'JavaScript', 'TypeScript', 'Python', 'PHP', 'HTML', 'CSS',
  'React.js', 'React Native', 'Next.js', 'Vue.js', 'Nuxt.js', 'PWA',
  'Node.js', 'NestJS', 'Express.js', 'Adonis.js', 'Flask', 'Laravel',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Prisma',
  'Jest', 'Cypress', 'Detox', 'Playwright', 'React Testing Library', 'TDD',
  'Docker', 'Azure', 'AWS', 'CI/CD', 'GitHub Actions', 'Git', 'GitHub',
  'GitLab', 'Scrum', 'Kanban', 'Jira', 'REST', 'microsserviços', 'SOLID',
  'SEO', 'LLM', 'RAG', 'WebLLM', 'WebGPU', 'ChatGPT', 'Gemini', 'Claude',
  'DeepSeek', 'Groq', 'Ollama', 'WordPress', 'Wix',
];

const extractCoreStack = (text: string): string[] =>
  TECH_LEXICON.filter((term) =>
    new RegExp(
      `(?<![\\w.])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w.])`,
      'i',
    ).test(text),
  );

/** Itens "Título + período + bullets" de uma seção (projetos/OSS). */
function parseNamedItems(section: string): { name: string; bullets: string[] }[] {
  const items: { name: string; bullets: string[] }[] = [];
  let cur: { name: string; bullets: string[] } | null = null;
  let lastWasBullet = false;
  let expectName = true; // início de seção ou logo após header
  for (const raw of section.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (isHeaderLine(line)) {
      expectName = true; // novo bloco — próxima linha não-bullet é nome
      continue;
    }
    if (/^[-•*·]/.test(line)) {
      (cur ??= { name: '', bullets: [] }).bullets.push(
        line.replace(/^[-•*·]\s*/, ''),
      );
      lastWasBullet = true;
      continue;
    }
    if (/\b(19|20)\d{2}\b/.test(line) && cur) continue; // linha de período
    // Linha solta: nome novo (após header / prefixo Projeto / 1ª linha) ou
    // continuação do último bullet (linha quebrada do PDF).
    if (expectName || /^projeto|project/i.test(line) || !cur) {
      if (cur) items.push(cur);
      cur = { name: line, bullets: [] };
      expectName = false;
    } else if (lastWasBullet) {
      cur.bullets[cur.bullets.length - 1] += ' ' + line;
      continue;
    } else {
      cur.name += ' ' + line;
    }
    lastWasBullet = false;
  }
  if (cur) items.push(cur);
  return items.filter((it) => it.name);
}

/**
 * Preenche o que o modelo deixou vazio usando apenas o que está literalmente
 * no documento — anti-fabricação preservada (presença literal ou cópia).
 */
function applyDeterministicBackstops(
  p: ExtractedProfile,
  doc: string,
  sections: CvSections | null,
): void {
  if (!p.coreStack.length) p.coreStack.push(...extractCoreStack(doc));
  if (p.seniorityYears === null) p.seniorityYears = extractSeniorityYears(doc);
  if (p.summary === NOT_INFORMED && sections?.summary) {
    // RESUMO/SUMMARY: corpo da seção sem o header — cópia literal, nunca gerada.
    const body = sections.summary
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !isHeaderLine(l))
      .join(' ');
    if (body) p.summary = body;
  }
  if (!p.languages.length && sections?.languages) {
    // "• Português: nativo." → "Português: nativo"
    for (const raw of sections.languages.split('\n')) {
      const line = raw.trim().replace(/^[-•*·]\s*/, '').replace(/\.$/, '');
      if (line && !isHeaderLine(line) && !/\b(19|20)\d{2}\b/.test(line)) {
        p.languages.push(line);
      }
    }
  }
  if (!p.projects.length && sections?.projects) {
    for (const it of parseNamedItems(sections.projects)) {
      p.projects.push({
        name: it.name,
        summary: it.bullets[0] ?? '',
        metrics: it.bullets.slice(1),
      });
    }
  }
  if (!p.openSourceProjects.length && sections?.openSource) {
    for (const it of parseNamedItems(sections.openSource)) {
      const repo = it.bullets.join(' ').match(/https?:\/\/\S+/)?.[0] ?? '';
      p.openSourceProjects.push({
        name: it.name,
        repo,
        summary: it.bullets[0] ?? '',
        metrics: it.bullets.slice(1),
      });
    }
  }
}

/** Linhas com ano (19xx-20xx) — cada experiência/período tem um. */
const countYearLines = (body: string): number =>
  body.split('\n').filter((l) => /\b(19|20)\d{2}\b/.test(l)).length;

/** Linhas-título: não-bullets, curtas, não-MAIÚSCULAS (headers excluídos). */
function countTitleLines(body: string): number {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length >= 5 &&
        l.length <= 80 &&
        !/^[-•*·]/.test(l) &&
        !isHeaderLine(l),
    ).length;
}

/** Chamada de parte via generatePart: schema mínimo + retry se faltar item. */
async function generatePartWithRetry(
  model: StructurerModel,
  part: {
    body: string;
    fields: string;
    schema: z.ZodType<Record<string, unknown>>;
    expected: number;
  },
): Promise<Record<string, unknown>> {
  const jsonSchema = zodToJson(part.schema);
  const basePrompt = [
    ANTI_FABRICATION_RULE,
    '',
    COMPLETENESS_RULE,
    '',
    `Return a single JSON object with ONLY these keys: ${part.fields}.`,
    'Include EVERY item present in <document> — if the text lists N items,',
    'the array must have N entries.',
    part.expected > 0
      ? `\nThis section contains approximately ${part.expected} item(s) — extract all of them.`
      : '',
    '',
    '<document>',
    part.body,
    '</document>',
  ]
    .filter(Boolean)
    .join('\n');

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? basePrompt
        : basePrompt +
          '\n\nYour previous attempt missed items or returned only placeholders. ' +
          `The section has ~${part.expected} item(s) — read <document> again and ` +
          'extract every real entry.';
    const raw = await model.generatePart!(prompt, jsonSchema);
    const parsed = part.schema.safeParse(raw);
    if (!parsed.success) continue;
    const ok =
      part.expected > 0
        ? countRealItems(parsed.data) >= part.expected
        : hasMeaningfulContent(parsed.data);
    if (ok) return parsed.data;
  }
  return {};
}

/** Algum valor útil — item de array real OU escalar preenchido (não-placeholder). */
function hasMeaningfulContent(data: Record<string, unknown>): boolean {
  return Object.values(data).some((v) => {
    if (Array.isArray(v)) return v.some((i) => !isPlaceholderItem(i));
    if (v === null || v === undefined) return false;
    if (typeof v === 'number' || typeof v === 'boolean') return true;
    return !isPlaceholderItem(v);
  });
}

/** Soma de itens reais (não-placeholder) nos arrays da parte. */
function countRealItems(data: Record<string, unknown>): number {
  let n = 0;
  for (const v of Object.values(data)) {
    if (Array.isArray(v)) n += v.filter((i) => !isPlaceholderItem(i)).length;
  }
  return n;
}

/** Objeto parcial da parte → shape de perfil completo p/ copyFilledFields. */
function wrapAsProfile(raw: Record<string, unknown>): unknown {
  return { ...makeEmptyProfile(), ...raw };
}

/** zod → JSON Schema p/ structured output (usa a SDK 'ai' já instalada). */
function zodToJson(schema: z.ZodType<Record<string, unknown>>): Record<string, unknown> {
  return zodSchema(schema).jsonSchema as Record<string, unknown>;
}

/** Prompt focado: preenche só `fields`; o resto sai vazio. */
function scopedPrompt(fields: string, body: string): string {
  return [
    ANTI_FABRICATION_RULE,
    '',
    `FOCUS: extract ONLY these fields: ${fields}.`,
    'For every other key return the empty value for its type',
    `("${NOT_INFORMED}", null, [] or {}).`,
    'Include EVERY item present in <document> for the requested fields —',
    'if the text lists N items, the array must have N entries.',
    '',
    COMPLETENESS_RULE,
    '',
    PROFILE_JSON_SKELETON,
    '',
    '<document>',
    body,
    '</document>',
  ].join('\n');
}

/** Copia do partial pro merged só o que o modelo realmente preencheu. */
function copyFilledFields(dst: ExtractedProfile, src: ExtractedProfile): void {
  for (const k of [
    'fullName', 'email', 'phone', 'linkedin', 'github', 'portfolio', 'location', 'summary',
  ] as const) {
    if (src[k] !== NOT_INFORMED && src[k] !== '') dst[k] = src[k];
  }
  for (const k of [
    'seniorityYears', 'salaryExpectationBRL', 'salaryExpectationUSD',
  ] as const) {
    if (src[k] !== null) dst[k] = src[k];
  }
  for (const k of [
    'coreStack', 'languages', 'certifications', 'blockedKeywords',
    'experiences', 'projects', 'openSourceProjects', 'education',
  ] as const) {
    dedupePush(dst[k] as unknown[], src[k] as unknown[]);
  }
}

/** Item-lixo que o modelo emite pra "preencher" array (todos os campos = NÃO_INFORMADO). */
const isPlaceholderItem = (item: unknown): boolean => {
  const empty = (v: unknown): boolean =>
    v === NOT_INFORMED || v === '' || v === null ||
    (typeof v === 'string' && /^(n\/?a|none|-)$/i.test(v.trim())) ||
    (Array.isArray(v) && v.every(empty));
  if (typeof item === 'string') return empty(item);
  if (item && typeof item === 'object') {
    return Object.values(item as Record<string, unknown>).every(empty);
  }
  return true;
};

/** Algum campo preenchido de verdade (não-placeholder)? */
const hasUsefulContent = (p: ExtractedProfile): boolean =>
  [
    p.coreStack, p.languages, p.certifications, p.blockedKeywords,
    p.experiences, p.projects, p.openSourceProjects, p.education,
  ].some((arr) => arr.some((i) => !isPlaceholderItem(i))) ||
  [
    p.fullName, p.email, p.phone, p.linkedin, p.github, p.portfolio, p.summary,
  ].some((v) => v !== NOT_INFORMED && v !== '') ||
  [p.seniorityYears, p.salaryExpectationBRL, p.salaryExpectationUSD].some(
    (v) => v !== null,
  );

/** Empurra itens reais, deduplicando (mesmo item pode vir de 2 seções). */
function dedupePush(dst: unknown[], items: unknown[]): void {
  const seen = new Set(dst.map((x) => JSON.stringify(x).toLowerCase()));
  for (const it of items) {
    if (isPlaceholderItem(it)) continue;
    const key = JSON.stringify(it).toLowerCase();
    if (!seen.has(key)) {
      dst.push(it);
      seen.add(key);
    }
  }
}

// ─── Divisão determinística do documento em seções ──────────────────────────

const SECTION_ALIASES: [key: string, re: RegExp][] = [
  ['openSource', /open[\s-]?source/i],
  ['experiences', /experi[êe]ncia|experience|hist[óo]rico/i],
  ['projects', /projeto|project|portf[óo]lio/i],
  ['education', /forma[çc][ãa]o|education|acad[êe]mica/i],
  ['languages', /idiomas|languages|l[íi]nguas/i],
  ['skills', /habilidades|skills|compet[êe]ncias|tecnologias/i],
  ['certifications', /certifica|cursos/i],
  ['summary', /resumo|summary|perfil|objetivo/i],
];

interface CvSections {
  firstHeader: string;
  [key: string]: string;
}

/** Linha é header se ≥80% das letras são maiúsculas (estilo "EXPERIÊNCIA"). */
const isHeaderLine = (line: string): boolean => {
  const s = line.trim();
  if (s.length < 4 || s.length > 60) return false;
  const letters = s.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  if (letters.length < 4) return false;
  return letters.replace(/[^A-ZÀ-Ú]/g, '').length / letters.length >= 0.8;
};

/**
 * Particiona o texto por headers MAIÚSCULOS e classifica cada bloco pelos
 * aliases. Seções repetidas (CV com 2x "EXPERIÊNCIA") são concatenadas.
 */
function splitCvSections(text: string): CvSections | null {
  const lines = text.split('\n');
  const found: Record<string, string[]> = {};
  let current: string | null = null;
  let firstHeader = '';

  for (const line of lines) {
    if (isHeaderLine(line)) {
      const hit = SECTION_ALIASES.find(([, re]) => re.test(line));
      current = hit ? hit[0] : null;
      if (!firstHeader) firstHeader = line;
      if (current) (found[current] ??= []).push(line + '\n');
      continue;
    }
    if (current) found[current]![found[current]!.length - 1] += line + '\n';
  }

  if (!firstHeader) return null;
  const out: CvSections = { firstHeader };
  for (const [k, chunks] of Object.entries(found)) out[k] = chunks.join('\n');
  return out;
}
