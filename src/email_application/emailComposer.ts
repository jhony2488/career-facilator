import type { SkillMetadata } from '../skills/core/skillRegistry';
import type { LocaleDecision } from '../geo/localeAdapter';

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
  attachments: string[];
  language: 'pt-BR' | 'en-US';
}

export interface ComposeInput {
  job: { title: string; company: string };
  recipient?: { email: string };
  profile: { fullName: string; email: string; linkedin: string };
  skills: SkillMetadata[];
  resumePath?: string;
  baseResumePath?: string;
  locale: LocaleDecision;
  fitScore?: number;
}

/**
 * Composição do pacote de candidatura por e-mail (feature/10): assunto direto
 * referente à vaga, corpo curto alinhado à skill ativa, anexo adaptado com
 * fallback para o currículo base.
 */
export async function composeEmail(input: ComposeInput): Promise<EmailDraft> {
  const { job, profile, locale, resumePath, baseResumePath } = input;
  const language = locale.resumeLanguage;

  const subject =
    language === 'pt-BR'
      ? `Candidatura — ${job.title} | ${profile.fullName}`
      : `Application — ${job.title} | ${profile.fullName}`;

  const skillHint = input.skills[0]?.name;

  const body =
    language === 'pt-BR'
      ? [
          `Olá, equipe ${job.company}.`,
          ``,
          `Gostaria de me candidatar à vaga de ${job.title}.`,
          skillHint
            ? `Meu foco principal é ${skillHint}, com experiência comprovada nas tecnologias exigidas.`
            : `Tenho experiência direta nas tecnologias exigidas.`,
          `Segue meu currículo em anexo. Fico à disposição para conversar.`,
          ``,
          `${profile.fullName}`,
          `${profile.email} · ${profile.linkedin}`,
        ].join('\n')
      : [
          `Hi ${job.company} team,`,
          ``,
          `I would like to apply for the ${job.title} position.`,
          skillHint
            ? `My main focus is ${skillHint}, with proven experience in the required stack.`
            : `I have hands-on experience with the required stack.`,
          `My resume is attached. Happy to talk whenever works for you.`,
          ``,
          `${profile.fullName}`,
          `${profile.email} · ${profile.linkedin}`,
        ].join('\n');

  const attachments = resumePath ? [resumePath] : baseResumePath ? [baseResumePath] : [];

  return {
    to: input.recipient?.email ?? '',
    subject,
    body,
    attachments,
    language,
  };
}
