import { runApplicationPipeline } from '../../src/core/pipeline';
import { makeMasterProfile, makeConfig } from '../helpers/factories';
import { mockRepo, mockTriageModel, mockTailorModel, fakePageState } from '../helpers/mocks';
import { SAMPLE_JOB_HTML } from '../helpers/fixtures';

/**
 * E2E: discovery → dedup → eligibility → triage → skills → tailor → autofill →
 * human review → APPLIED. All external dependencies are mocked.
 */
describe('Full pipeline — happy path (SEMI_AUTO with human approval)', () => {
  it('processes a job end to end until APPLIED', async () => {
    // features 01–07: full application cycle
    const repo = mockRepo();
    const config = makeConfig();
    config.execution.mode = 'SEMI_AUTO';

    const result = await runApplicationPipeline(
      {
        rawJobs: [
          {
            html: SAMPLE_JOB_HTML,
            url: 'https://boards.greenhouse.io/techcorp/jobs/123?utm_source=x',
          },
        ],
        profile: makeMasterProfile(),
        config,
      },
      {
        repo,
        triageModel: mockTriageModel({ fitScore: 80, matchedKeywords: ['TypeScript', 'Next.js'] }),
        tailorModel: mockTailorModel(),
        pageFactory: () => fakePageState(),
        humanApproval: () => true, // user approves in the review
      },
    );

    expect(result.processed).toBe(1);
    const app = result.applications[0];
    expect(app.status).toBe('APPLIED');
    expect(app.stages).toEqual(
      expect.arrayContaining(['DISCOVERED', 'TRIAGED', 'TAILORED', 'READY_TO_REVIEW', 'APPLIED']),
    );
    expect(app.resumePath).toBeTruthy();
  });

  it('discards a duplicate job without consuming any AI tokens', async () => {
    // feature/02: Canonical URL block — discarded in 0ms/0 tokens
    const repo = mockRepo();
    repo.dedupCheck.mockResolvedValue({ duplicate: true, reason: 'CANONICAL_URL' });
    const triageModel = mockTriageModel();
    const tailorModel = mockTailorModel();

    const result = await runApplicationPipeline(
      {
        rawJobs: [{ html: SAMPLE_JOB_HTML, url: 'https://boards.greenhouse.io/techcorp/jobs/123' }],
        profile: makeMasterProfile(),
        config: makeConfig(),
      },
      { repo, triageModel, tailorModel, pageFactory: () => fakePageState() },
    );

    expect(result.applications[0].status).toBe('SKIPPED');
    expect(triageModel.generate).not.toHaveBeenCalled();
    expect(tailorModel.tailor).not.toHaveBeenCalled();
  });

  it('marks SKIPPED without generating a resume when Fit Score < minimum', async () => {
    // feature/03: score 74 → SKIPPED at the boundary
    const repo = mockRepo();
    const tailorModel = mockTailorModel();

    const result = await runApplicationPipeline(
      {
        rawJobs: [{ html: SAMPLE_JOB_HTML, url: 'https://boards.greenhouse.io/lowfit/jobs/1' }],
        profile: makeMasterProfile(),
        config: makeConfig(),
      },
      {
        repo,
        triageModel: mockTriageModel({ fitScore: 74 }),
        tailorModel,
        pageFactory: () => fakePageState(),
      },
    );

    expect(result.applications[0].status).toBe('SKIPPED');
    expect(tailorModel.tailor).not.toHaveBeenCalled();
  });

  it('keeps the budget: the expensive tier only runs for approved jobs', async () => {
    // doc 01: only the top ~15% of jobs reach Tier 2
    const repo = mockRepo();
    const tailorModel = mockTailorModel();
    const triageModel = mockTriageModel();

    const jobs = [
      { html: SAMPLE_JOB_HTML, url: 'https://a.co/1' },
      { html: SAMPLE_JOB_HTML, url: 'https://a.co/2' },
      { html: SAMPLE_JOB_HTML, url: 'https://a.co/3' },
    ];
    // 1 approved (80), 2 rejected (50)
    triageModel.generate
      .mockResolvedValueOnce({
        fitScore: 80,
        isDealbreaker: false,
        missingSkills: [],
        matchedKeywords: ['ts'],
        atsTitleSuggestion: 'x',
      })
      .mockResolvedValue({
        fitScore: 50,
        isDealbreaker: false,
        missingSkills: [],
        matchedKeywords: [],
        atsTitleSuggestion: 'x',
      });

    const result = await runApplicationPipeline(
      { rawJobs: jobs, profile: makeMasterProfile(), config: makeConfig() },
      {
        repo,
        triageModel,
        tailorModel,
        pageFactory: () => fakePageState(),
        humanApproval: () => true,
      },
    );

    expect(result.processed).toBe(3);
    expect(tailorModel.tailor).toHaveBeenCalledTimes(1);
    expect(result.tokenReport.smartTierCalls).toBe(1);
  });
});
