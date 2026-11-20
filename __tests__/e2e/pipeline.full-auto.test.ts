import { runApplicationPipeline } from '../../src/core/pipeline';
import type { JobStatus } from '../helpers/contracts';
import { makeMasterProfile, makeConfig } from '../helpers/factories';
import { mockRepo, mockTriageModel, mockTailorModel, fakePageState } from '../helpers/mocks';
import { SAMPLE_JOB_HTML } from '../helpers/fixtures';

describe('Full pipeline — FULL_AUTO mode', () => {
  const fullAutoConfig = () => {
    const c = makeConfig();
    c.execution.mode = 'FULL_AUTO';
    return c;
  };

  it('submits on its own when score >= threshold and there are no blockers', async () => {
    // feature/07: FULL_AUTO mode with score 90 → automatic submission
    const page = fakePageState();
    const result = await runApplicationPipeline(
      {
        rawJobs: [{ html: SAMPLE_JOB_HTML, url: 'https://boards.greenhouse.io/top/jobs/1' }],
        profile: makeMasterProfile(),
        config: fullAutoConfig(),
      },
      {
        repo: mockRepo(),
        triageModel: mockTriageModel({ fitScore: 92 }),
        tailorModel: mockTailorModel(),
        pageFactory: () => page,
        humanApproval: () => {
          throw new Error('must not request approval in FULL_AUTO');
        },
      },
    );

    expect(result.applications[0].status).toBe('APPLIED');
  });

  it('escalates to a human upon hitting a CAPTCHA even with a very high score', async () => {
    // feature/07 + feature/09: CAPTCHA blocks automatic submission
    const page = fakePageState({ hasCaptcha: true });
    const result = await runApplicationPipeline(
      {
        rawJobs: [{ html: SAMPLE_JOB_HTML, url: 'https://boards.greenhouse.io/cap/jobs/2' }],
        profile: makeMasterProfile(),
        config: fullAutoConfig(),
      },
      {
        repo: mockRepo(),
        triageModel: mockTriageModel({ fitScore: 95 }),
        tailorModel: mockTailorModel(),
        pageFactory: () => page,
      },
    );

    expect(result.applications[0].status).toBe('NEEDS_HUMAN_INPUT');
    expect(page.submitted).toBe(false);
  });

  it('defers submissions when the daily limit is reached', async () => {
    // feature/07: Respect the daily application limit
    const config = fullAutoConfig();
    config.execution.maxDailyApplications = 1;

    const jobs = [
      { html: SAMPLE_JOB_HTML, url: 'https://a.co/job-1' },
      { html: SAMPLE_JOB_HTML, url: 'https://a.co/job-2' },
    ];

    const result = await runApplicationPipeline(
      { rawJobs: jobs, profile: makeMasterProfile(), config },
      {
        repo: mockRepo(),
        triageModel: mockTriageModel({ fitScore: 92 }),
        tailorModel: mockTailorModel(),
        pageFactory: () => fakePageState(),
      },
    );

    const statuses = result.applications.map((a: { status: JobStatus }) => a.status);
    expect(statuses.filter((s: JobStatus) => s === 'APPLIED')).toHaveLength(1);
    expect(statuses).toContain('DEFERRED');
  });
});
