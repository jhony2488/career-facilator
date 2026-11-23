import type { JobTriageResult } from './triageAgent';

export interface TailorInput {
  job: { id: string; title: string; company: string; descriptionMarkdown: string };
  triage: JobTriageResult | Record<string, never>;
  skillsBlock: string;
  profile: unknown;
  /**
   * Contexto do perfil já filtrado por relevância (RAG). Quando presente,
   * substitui o dump JSON completo — essencial para modelos pequenos (3B).
   */
  profileContext?: string;
  /**
   * Idioma alvo do currículo e das respostas (resolveLocale do scope da vaga —
   * INTERNATIONAL → en-US). Ausente = idioma do perfil.
   */
  resumeLanguage?: 'pt-BR' | 'en-US';
}

export interface TailoredAssets {
  resumeMarkdown: string;
  answers: Record<string, string>;
  resumePath?: string;
}

export interface TailorModel {
  tailor(prompt: string): Promise<{ resumeMarkdown: string; answers: Record<string, string> }>;
}

export interface TailorDeps {
  model: TailorModel;
}

// Cache de prefixo do perfil-mestre (doc 03 §5.3): reusa o mesmo bloco de
// sistema para vagas em lote — desconto de 75–90% nos tokens de entrada.
let cachedProfileBlock: string | null = null;
let cachedProfileRef: unknown = null;

function profileCacheBlock(profile: unknown): string {
  if (cachedProfileRef !== profile) {
    cachedProfileRef = profile;
    cachedProfileBlock = `<master_profile>\n${JSON.stringify(profile)}\n</master_profile>`;
  }
  return cachedProfileBlock!;
}

/**
 * Camada 2 — geração de ativos (doc 03 §5.3, feature/05): adapta o CV e gera
 * respostas dissertativas usando o perfil-mestre em cache de prompt.
 * Regra anti-fabricação: o modelo só reorganiza/enfatiza o que existe no perfil.
 */
export async function tailorResume(input: TailorInput, deps: TailorDeps): Promise<TailoredAssets> {
  const prompt = [
    'You are a resume tailoring engine. Adapt the master profile to the job.',
    'NEVER invent skills, experiences or metrics absent from the master profile.',
    'Only reorder, rephrase and emphasize what exists.',
    ...(input.resumeLanguage
      ? [
          `Write resumeMarkdown and all answer values in ${
            input.resumeLanguage === 'en-US' ? 'English' : 'Portuguese'
          }.`,
        ]
      : []),
    '',
    input.profileContext
      ? `<master_profile_relevant>\n${input.profileContext}\n</master_profile_relevant>`
      : profileCacheBlock(input.profile),
    '',
    input.skillsBlock || '',
    '',
    '<job>',
    `title: ${input.job.title}`,
    `company: ${input.job.company}`,
    input.job.descriptionMarkdown,
    '</job>',
    '',
    '<triage>',
    JSON.stringify(input.triage),
    '</triage>',
  ].join('\n');

  const output = await deps.model.tailor(prompt);
  return {
    resumeMarkdown: output.resumeMarkdown,
    answers: output.answers,
    // job.id pode ser título/URL com chars ilegais em filename (/, :, ?, espaços)
    resumePath: `storage/generated_resumes/${slugFilename(input.job.id)}.pdf`,
  };
}

/** Filename seguro: [a-z0-9._-], colapsa o resto em '-', até 80 chars. */
export function slugFilename(id: string): string {
  const slug = id
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') /* combining marks U+0300–U+036F */
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  return (slug || 'job').slice(0, 80);
}

export function invalidateProfileCache(): void {
  cachedProfileBlock = null;
  cachedProfileRef = null;
}
