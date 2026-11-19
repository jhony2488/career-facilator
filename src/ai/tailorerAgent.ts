import type { JobTriageResult } from './triageAgent';

export interface TailorInput {
  job: { id: string; title: string; company: string; descriptionMarkdown: string };
  triage: JobTriageResult | Record<string, never>;
  skillsBlock: string;
  profile: unknown;
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
    '',
    profileCacheBlock(input.profile),
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
    resumePath: `storage/generated_resumes/${input.job.id}.pdf`,
  };
}

export function invalidateProfileCache(): void {
  cachedProfileBlock = null;
  cachedProfileRef = null;
}
