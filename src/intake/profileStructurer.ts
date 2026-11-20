import { z } from 'zod';

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

/** Esqueleto do schema declarado no prompt — modelos pequenos precisam da forma. */
const PROFILE_JSON_SKELETON = [
  'Return a single JSON object with exactly these keys:',
  'fullName, email, phone, linkedin, github, portfolio, summary (strings);',
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
  const prompt = [
    ANTI_FABRICATION_RULE,
    '',
    PROFILE_JSON_SKELETON,
    '',
    '<document>',
    input.documentText,
    '</document>',
  ].join('\n');

  const raw = await deps.model.generate(prompt);
  return MasterProfileSchema.parse(raw);
}
