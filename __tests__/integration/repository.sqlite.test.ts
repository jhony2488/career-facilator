import { JobRepository } from '../../src/db/repository';
import { makeJob } from '../helpers/factories';

describe('JobRepository — 3-level deduplication (real SQLite)', () => {
  let repo: JobRepository;

  beforeEach(() => {
    repo = new JobRepository(':memory:');
  });

  afterEach(() => {
    repo.close();
  });

  it('detects duplicates by canonical URL ignoring tracking parameters', async () => {
    // feature/02: Canonical URL block + tracking params normalization
    await repo.recordJob(makeJob({ url: 'https://boards.greenhouse.io/techcorp/jobs/123' }));

    const verdict = await repo.dedupCheck({
      url: 'https://boards.greenhouse.io/techcorp/jobs/123?utm_source=linkedin&ref=feed',
      company: 'OtherCo',
      title: 'Different Title',
      descriptionMarkdown: 'completely different text',
    });

    expect(verdict.duplicate).toBe(true);
    expect(verdict.reason).toBe('CANONICAL_URL');
  });

  it('detects the same job on different platforms via content hash', async () => {
    // feature/02: Content Hash block (cross-platform)
    const job = makeJob();
    await repo.recordJob(job);

    const verdict = await repo.dedupCheck({
      url: 'https://linkedin.com/jobs/view/999999',
      company: job.company,
      title: job.title,
      descriptionMarkdown: job.descriptionMarkdown,
    });

    expect(verdict.duplicate).toBe(true);
    expect(verdict.reason).toBe('CONTENT_HASH');
  });

  it('does not treat a job from the same company with different content as a duplicate', async () => {
    // feature/02: Allow a job with the same title but different content
    await repo.recordJob(makeJob({ title: 'Backend Engineer' }));

    const verdict = await repo.dedupCheck({
      url: 'https://boards.greenhouse.io/techcorp/jobs/456',
      company: 'TechCorp',
      title: 'Backend Engineer',
      descriptionMarkdown: 'DevOps role description completely different from before...',
    });

    expect(verdict.duplicate).toBe(false);
  });

  it('blocks via cooldown when there was already a recent application at the company', async () => {
    // feature/02: Block a new application within the per-company cooldown
    await repo.recordJob(makeJob({ status: 'APPLIED' }));

    const verdict = await repo.dedupCheck(
      {
        url: 'https://boards.greenhouse.io/techcorp/jobs/789',
        company: 'TechCorp',
        title: 'Another Role',
        descriptionMarkdown: 'New different description here.',
      },
      { companyCooldownDays: 30 },
    );

    expect(verdict.duplicate).toBe(true);
    expect(verdict.reason).toBe('COMPANY_COOLDOWN');
  });

  it('does not count SKIPPED applications toward the per-company cooldown', async () => {
    // DECISOES.md suggestion #3: cooldown only counts actual submissions
    await repo.recordJob(makeJob({ status: 'SKIPPED' }));

    const verdict = await repo.dedupCheck(
      {
        url: 'https://boards.greenhouse.io/techcorp/jobs/789',
        company: 'TechCorp',
        title: 'Another Role',
        descriptionMarkdown: 'New different description here.',
      },
      { companyCooldownDays: 30 },
    );

    expect(verdict.duplicate).toBe(false);
  });

  it('persists the application state-machine transitions', async () => {
    // feature/04: state machine DISCOVERED → ... → APPLIED
    const job = makeJob();
    await repo.recordJob(job);

    await repo.updateStatus(job.url, 'TRIAGED');
    await repo.updateStatus(job.url, 'TAILORED');
    await repo.updateStatus(job.url, 'APPLIED');

    const stored = await repo.getByUrl(job.canonicalUrl);
    expect(stored?.status).toBe('APPLIED');
    expect(stored?.appliedAt).toBeTruthy();
  });
});
