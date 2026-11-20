import { runApplicationPipeline } from '../../src/core/pipeline';
import type { JobStatus } from '../helpers/contracts';
import { makeMasterProfile, makeConfig } from '../helpers/factories';
import { mockRepo, mockTriageModel, mockTailorModel, fakePageState } from '../helpers/mocks';
import { SAMPLE_JOB_HTML } from '../helpers/fixtures';

describe('Full pipeline — dry-run mode', () => {
  it('runs the entire funnel without performing any submission', async () => {
    // feature/12: Simulate the full funnel without sending applications
    const page = fakePageState();
    const result = await runApplicationPipeline(
      {
        rawJobs: [
          { html: SAMPLE_JOB_HTML, url: 'https://a.co/dry-1' },
          { html: SAMPLE_JOB_HTML, url: 'https://a.co/dry-2' },
        ],
        profile: makeMasterProfile(),
        config: makeConfig(),
        dryRun: true,
      },
      {
        repo: mockRepo(),
        triageModel: mockTriageModel({ fitScore: 90 }),
        tailorModel: mockTailorModel(),
        pageFactory: () => page,
        humanApproval: () => true,
      },
    );

    expect(page.submitted).toBe(false);
    expect(result.applications.every((a: { status: JobStatus }) => a.status !== 'APPLIED')).toBe(
      true,
    );
  });

  it('presents a summary with Fit Scores and intended destinations for calibration', async () => {
    // feature/12: Record the simulated result for threshold calibration
    const result = await runApplicationPipeline(
      {
        rawJobs: [{ html: SAMPLE_JOB_HTML, url: 'https://a.co/dry-3' }],
        profile: makeMasterProfile(),
        config: makeConfig(),
        dryRun: true,
      },
      {
        repo: mockRepo(),
        triageModel: mockTriageModel({ fitScore: 90 }),
        tailorModel: mockTailorModel(),
        pageFactory: () => fakePageState(),
      },
    );

    expect(result.dryRunReport).toBeDefined();
    expect(result.dryRunReport!.jobs[0].fitScore).toBe(90);
    expect(result.dryRunReport!.jobs[0].intendedRoute).toBeDefined();
    expect(result.dryRunReport!.jobs[0].skillsActivated).toBeDefined();
  });
});
