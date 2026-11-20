import { JobTriageSchema, triageJob } from '../../../src/ai/triageAgent';
import { makeJob, makeMasterProfile } from '../../helpers/factories';
import { mockTriageModel, mockFailingTriageModel } from '../../helpers/mocks';
import { INTL_JOB_DESCRIPTION } from '../../helpers/fixtures';

describe('JobTriageSchema', () => {
  it('accepts a valid triage result', () => {
    const valid = {
      fitScore: 80,
      isDealbreaker: false,
      missingSkills: ['GraphQL'],
      matchedKeywords: ['TypeScript'],
      atsTitleSuggestion: 'Senior Full-Stack Engineer',
    };
    expect(JobTriageSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects fitScore outside the 0-100 range', () => {
    // feature/03: score is a job-fit rating from 0 to 100
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

  it('limits missingSkills to 5 and matchedKeywords to 10 items', () => {
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

  it('produces a structured assessment with score, dealbreaker and keywords', async () => {
    // feature/03: Compute structured Fit Score for a job that passed layer zero
    const model = mockTriageModel({ fitScore: 82, matchedKeywords: ['TypeScript', 'Next.js'] });
    const result = await triageJob({ jobText: INTL_JOB_DESCRIPTION, profile }, { model });

    expect(result.fitScore).toBe(82);
    expect(result.matchedKeywords).toContain('TypeScript');
    expect(result.isDealbreaker).toBe(false);
    expect(model.generate).toHaveBeenCalledTimes(1);
  });

  it('sends the job clean markdown, not the raw HTML, to the model', async () => {
    const model = mockTriageModel();
    await triageJob({ jobText: job.descriptionMarkdown, profile }, { model });

    const prompt = model.generate.mock.calls[0][0];
    expect(prompt).not.toContain('<script>');
    expect(prompt).not.toContain('<style>');
  });

  it('flags the dealbreaker when the model detects it', async () => {
    // feature/03: Discard a job with a declared dealbreaker even with a high score
    const model = mockTriageModel({ fitScore: 90, isDealbreaker: true });
    const result = await triageJob({ jobText: INTL_JOB_DESCRIPTION, profile }, { model });

    expect(result.isDealbreaker).toBe(true);
  });

  it('propagates model failure without approving the job', async () => {
    // feature/03: Triage model failure does not automatically approve the job
    const model = mockFailingTriageModel();
    await expect(
      triageJob({ jobText: INTL_JOB_DESCRIPTION, profile }, { model }),
    ).rejects.toThrow();
  });
});
