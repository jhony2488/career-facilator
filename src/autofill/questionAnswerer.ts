import type { UnresolvedQuestion } from './formExecutor';

/**
 * Respostas ao vivo (decisão #39): perguntas do form que nenhuma fonte
 * determinística cobriu vão ao tier SMART numa chamada batelada por etapa —
 * o perfil (RAG) é a única fonte permitida; `""` = sem resposta → humano.
 */

export interface AnswerContext {
  jobTitle: string;
  company?: string;
  /** Trecho do markdown da vaga (o chamador aplica o cap de chars). */
  jobExcerpt?: string;
  /** Contexto do perfil filtrado por relevância (buildProfileContext — RAG). */
  profileContext?: string;
}

/** Adapter do tier SMART: prompt → mapa pergunta→resposta. */
export interface AnswersModel {
  answer(prompt: string): Promise<Record<string, string>>;
}

/**
 * Prompt anti-fabricação: responder só o que o perfil sustenta; `choice`
 * deve devolver a alternativa verbatim; `""` para o irrespondível.
 */
export function buildAnswersPrompt(
  ctx: AnswerContext,
  questions: UnresolvedQuestion[],
): string {
  return [
    'You are filling a job application form on behalf of the candidate below.',
    'Answer ONLY what the candidate profile supports — never invent experience,',
    'skills, dates, work authorization, salary or metrics absent from the profile.',
    'For questions with OPTIONS, answer with the exact option text (verbatim).',
    'For anything you cannot ground in the profile, answer "" (empty string).',
    'Keep answers short — a phrase or one sentence. Match the question language.',
    '',
    '<job>',
    `title: ${ctx.jobTitle}`,
    ctx.company ? `company: ${ctx.company}` : '',
    ctx.jobExcerpt ?? '',
    '</job>',
    '',
    ctx.profileContext ? `<candidate_profile>\n${ctx.profileContext}\n</candidate_profile>` : '',
    '',
    '<questions>',
    JSON.stringify(
      questions.map((q) => ({
        question: q.label,
        required: q.required,
        ...(q.options?.length ? { options: q.options } : {}),
      })),
      null,
      1,
    ),
    '</questions>',
    '',
    'Respond with a JSON object only: {"answers":{"<question>":"<answer>"}}',
    'Answer every question key — use "" when the profile does not cover it.',
  ].join('\n');
}

/**
 * Sanitiza a saída estruturada: só pares string→string não vazios, trim nos
 * valores (respostas em branco não valem — o campo segue para o humano).
 */
export function parseAnswers(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const answers =
    raw && typeof raw === 'object' && 'answers' in raw
      ? (raw as { answers: unknown }).answers
      : raw;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return out;
  for (const [k, v] of Object.entries(answers as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return out;
}
