import { z } from 'zod';

export const JobTriageSchema = z.object({
  fitScore: z.number().min(0).max(100).describe('Aderência técnica e de senioridade de 0 a 100'),
  isDealbreaker: z.boolean().describe('True se exigir idioma, localização ou stack impossível'),
  missingSkills: z.array(z.string()).max(5),
  matchedKeywords: z.array(z.string()).max(10),
  atsTitleSuggestion: z.string().describe('Título profissional ideal para o topo do currículo'),
});

export type JobTriageResult = z.infer<typeof JobTriageSchema>;

export interface TriageInput {
  jobText: string; // markdown limpo da vaga (nunca HTML bruto)
  profile: unknown;
}

export interface TriageModel {
  generate(prompt: string): Promise<JobTriageResult>;
}

export interface TriageDeps {
  model: TriageModel;
}

/**
 * Triagem da Camada 1 (doc 03 §5.2, feature/03): modelo leve produz JSON
 * estruturado; saída validada via Zod para impedir alucinação de formato.
 */
export async function triageJob(input: TriageInput, deps: TriageDeps): Promise<JobTriageResult> {
  const prompt = buildTriagePrompt(input);
  const raw = await deps.model.generate(prompt);
  return JobTriageSchema.parse(raw);
}

/**
 * Resumo compacto do perfil para triagem (~300 tok em vez do dump JSON inteiro)
 * — essencial para modelos pequenos (3B) com contexto prático limitado.
 */
export function summarizeProfileForTriage(profile: unknown): string {
  const p = (profile ?? {}) as Record<string, unknown>;
  const lines: string[] = [];
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  const arr = (v: unknown) => (Array.isArray(v) && v.length ? v.filter(Boolean).join(', ') : null);

  const summary = str(p.summary);
  if (summary) lines.push(`Resumo: ${summary}`);
  const stack = arr(p.coreStack);
  if (stack) lines.push(`Stack principal: ${stack}`);
  if (typeof p.seniorityYears === 'number') lines.push(`Senioridade: ${p.seniorityYears} anos`);
  const langs = arr(p.languages);
  if (langs) lines.push(`Idiomas: ${langs}`);
  const blocked = arr(p.blockedKeywords);
  if (blocked) lines.push(`Keywords bloqueadas: ${blocked}`);
  const answers = p.standardAnswers;
  if (answers && typeof answers === 'object' && Object.keys(answers).length) {
    lines.push(`Fatos: ${JSON.stringify(answers)}`);
  }
  if (!lines.length) return JSON.stringify(p).slice(0, 1500);
  return lines.join('\n');
}

function buildTriagePrompt(input: TriageInput): string {
  return [
    'You are a job-fit triage engine. Evaluate the job against the candidate profile.',
    'Return ONLY a JSON object with exactly these fields:',
    'fitScore (0-100 number), isDealbreaker (boolean), missingSkills (string[] max 5),',
    'matchedKeywords (string[] max 10), atsTitleSuggestion (string).',
    '',
    '<candidate_profile>',
    summarizeProfileForTriage(input.profile),
    '</candidate_profile>',
    '',
    '<job_description>',
    input.jobText,
    '</job_description>',
  ].join('\n');
}
