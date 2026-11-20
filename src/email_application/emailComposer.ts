import { readFile } from 'node:fs/promises';
import type { SkillMetadata } from '../skills/core/skillRegistry';
import type { LocaleDecision } from '../geo/localeAdapter';
import { renderTemplate } from '../utils/textTemplate';

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
  attachments: string[];
  language: 'pt-BR' | 'en-US';
  fitScore?: number;
}

export interface ComposeProfile {
  fullName: string;
  email: string;
  linkedin: string;
  github?: string;
  portfolio?: string;
}

export interface ComposeInput {
  job: { title: string; company: string };
  recipient?: { email: string };
  profile: ComposeProfile;
  skills: SkillMetadata[];
  resumePath?: string;
  baseResumePath?: string;
  locale: LocaleDecision;
  fitScore?: number;
  /** Caminho do template do usuário — fallback p/ built-in se ausente. */
  bodyTemplatePath?: string;
  includeSalaryExpectation?: boolean;
}

/** Templates built-in — modelo preferido do usuário (doc 11). */
export const BUILTIN_BODY_TEMPLATES: Record<'pt-BR' | 'en-US', string> = {
  'pt-BR': `Bom dia,

Segue em anexo o meu currículo e mais alguns links importantes.

LinkedIn: {{linkedin}}
GitHub: {{github}}

Pretensão salarial: {{salaryExpectation}}

{{fullName}}
{{email}}`,
  'en-US': `Good morning,

Attached is my resume along with a few important links.

LinkedIn: {{linkedin}}
GitHub: {{github}}

Salary expectation: {{salaryExpectation}}

{{fullName}}
{{email}}`,
};

function formatSalary(value: number, currency: 'BRL' | 'USD'): string {
  return new Intl.NumberFormat(currency === 'BRL' ? 'pt-BR' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Composição do pacote de candidatura por e-mail (doc 11): assunto direto
 * referente à vaga, corpo via template preferido do usuário (editável em
 * `bodyTemplatePath`; built-in como fallback), anexo adaptado com fallback
 * para o currículo base.
 */
export async function composeEmail(input: ComposeInput): Promise<EmailDraft> {
  const { job, profile, locale, resumePath, baseResumePath } = input;
  const language = locale.resumeLanguage;

  const subject =
    language === 'pt-BR'
      ? `Candidatura — ${job.title} | ${profile.fullName}`
      : `Application — ${job.title} | ${profile.fullName}`;

  let template = BUILTIN_BODY_TEMPLATES[language];
  if (input.bodyTemplatePath) {
    try {
      const custom = await readFile(input.bodyTemplatePath, 'utf-8');
      if (custom.trim()) template = custom;
    } catch {
      // arquivo ausente/ilegível → built-in
    }
  }

  const salaryExpectation =
    input.includeSalaryExpectation === false || !locale.salaryExpectation
      ? ''
      : formatSalary(locale.salaryExpectation, locale.currency);

  const body = renderTemplate(template, {
    fullName: profile.fullName,
    email: profile.email,
    linkedin: profile.linkedin,
    github: profile.github ?? '',
    portfolio: profile.portfolio ?? '',
    jobTitle: job.title,
    company: job.company,
    salaryExpectation,
    skill: input.skills[0]?.name,
  });

  const attachments = resumePath ? [resumePath] : baseResumePath ? [baseResumePath] : [];

  return {
    to: input.recipient?.email ?? '',
    subject,
    body,
    attachments,
    language,
    fitScore: input.fitScore,
  };
}
