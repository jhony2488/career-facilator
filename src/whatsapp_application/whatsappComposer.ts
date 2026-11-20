import { readFile } from 'node:fs/promises';
import type { SkillMetadata } from '../skills/core/skillRegistry';
import type { LocaleDecision } from '../geo/localeAdapter';
import { renderTemplate } from '../utils/textTemplate';
import { BUILTIN_BODY_TEMPLATES, type ComposeProfile } from '../email_application/emailComposer';

export interface WhatsappMessage {
  number: string;
  text: string;
  resumePath?: string;
  language: 'pt-BR' | 'en-US';
}

export interface WhatsappComposeInput {
  job: { title: string; company: string };
  recipient: { number: string };
  profile: ComposeProfile;
  skills: SkillMetadata[];
  resumePath?: string;
  baseResumePath?: string;
  locale: LocaleDecision;
  /** Template próprio do WhatsApp — fallback para o template do e-mail. */
  bodyTemplatePath?: string;
  includeSalaryExpectation?: boolean;
  attachResume?: boolean;
}

function formatSalary(value: number, currency: 'BRL' | 'USD'): string {
  return new Intl.NumberFormat(currency === 'BRL' ? 'pt-BR' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Composição da candidatura por WhatsApp (doc 15): texto via template do
 * usuário (whatsapp_template.md; fallback para o mesmo modelo do e-mail) e
 * currículo PDF resolvido — adaptado da vaga, com fallback para o base.
 */
export async function composeWhatsapp(input: WhatsappComposeInput): Promise<WhatsappMessage> {
  const { job, profile, locale, resumePath, baseResumePath } = input;
  const language = locale.resumeLanguage;

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

  const text = renderTemplate(template, {
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

  const attach = input.attachResume !== false;
  const pdf = attach ? (resumePath ?? baseResumePath) : undefined;

  return {
    number: input.recipient.number,
    text,
    resumePath: pdf,
    language,
  };
}
