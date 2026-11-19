import { JobTriageSchema, triageJob } from '../../../src/ai/triageAgent';
import { makeJob, makeMasterProfile } from '../../helpers/factories';
import { mockTriageModel, mockFailingTriageModel } from '../../helpers/mocks';
import { INTL_JOB_DESCRIPTION } from '../../helpers/fixtures';

describe('JobTriageSchema', () => {
  it('aceita um resultado de triagem válido', () => {
    const valid = {
      fitScore: 80,
      isDealbreaker: false,
      missingSkills: ['GraphQL'],
      matchedKeywords: ['TypeScript'],
      atsTitleSuggestion: 'Senior Full-Stack Engineer',
    };
    expect(JobTriageSchema.safeParse(valid).success).toBe(true);
  });

  it('rejeita fitScore fora do intervalo 0-100', () => {
    // feature/03: score é aderência de 0 a 100
    const base = {
      fitScore: 0,
      isDealbreaker: false,
      missingSkills: [],
      matchedKeywords: [],
      atsTitleSuggestion: 'x',
    };
    expect(JobTriageSchema.safeParse({ ...base, fitScore: -1 }).success).toBe(false);
    expect(JobTriageSchema.safeParse({ ...base, fitScore: 101 }).success).toBe(false);
  });

  it('limita missingSkills a 5 e matchedKeywords a 10 itens', () => {
    const base = {
      fitScore: 50,
      isDealbreaker: false,
      missingSkills: [],
      matchedKeywords: [],
      atsTitleSuggestion: 'x',
    };
    expect(JobTriageSchema.safeParse({ ...base, missingSkills: Array(6).fill('s') }).success).toBe(
      false,
    );
    expect(
      JobTriageSchema.safeParse({ ...base, matchedKeywords: Array(11).fill('k') }).success,
    ).toBe(false);
  });
});

describe('triageJob', () => {
  const profile = makeMasterProfile();
  const job = makeJob();

  it('produz avaliação estruturada com score, impedimento e palavras-chave', async () => {
    // feature/03: Calcular Fit Score estruturado para vaga que passou na camada zero
    const model = mockTriageModel({ fitScore: 82, matchedKeywords: ['TypeScript', 'Next.js'] });
    const result = await triageJob({ jobText: INTL_JOB_DESCRIPTION, profile }, { model });

    expect(result.fitScore).toBe(82);
    expect(result.matchedKeywords).toContain('TypeScript');
    expect(result.isDealbreaker).toBe(false);
    expect(model.generate).toHaveBeenCalledTimes(1);
  });

  it('envia o markdown limpo da vaga, não o HTML bruto, ao modelo', async () => {
    const model = mockTriageModel();
    await triageJob({ jobText: job.descriptionMarkdown, profile }, { model });

    const prompt = model.generate.mock.calls[0][0];
    expect(prompt).not.toContain('<script>');
    expect(prompt).not.toContain('<style>');
  });

  it('sinaliza impedimento quando o modelo o detecta', async () => {
    // feature/03: Descartar vaga com impedimento declarado mesmo com score alto
    const model = mockTriageModel({ fitScore: 90, isDealbreaker: true });
    const result = await triageJob({ jobText: INTL_JOB_DESCRIPTION, profile }, { model });

    expect(result.isDealbreaker).toBe(true);
  });

  it('propaga falha do modelo sem aprovar a vaga', async () => {
    // feature/03: Falha do modelo de triagem não aprova a vaga automaticamente
    const model = mockFailingTriageModel();
    await expect(
      triageJob({ jobText: INTL_JOB_DESCRIPTION, profile }, { model }),
    ).rejects.toThrow();
  });
});
