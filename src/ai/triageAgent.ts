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

function buildTriagePrompt(input: TriageInput): string {
  return [
    'You are a job-fit triage engine. Evaluate the job against the candidate profile.',
    'Return ONLY structured output matching the required schema.',
    '',
    '<candidate_profile>',
    JSON.stringify(input.profile),
    '</candidate_profile>',
    '',
    '<job_description>',
    input.jobText,
    '</job_description>',
  ].join('\n');
}
