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

  it('counts emails sent today for the daily cap', async () => {
    // feature/10: maxDailyEmails counts real sends from the applications table
    const job = makeJob();
    await repo.recordJob(job);

    expect(await repo.countEmailsSentToday()).toBe(0);
    await repo.recordEmailApplication({ jobId: job.id, recipient: 'a@b.c', subject: 's' });
    await repo.recordEmailApplication({ jobId: job.id, recipient: 'c@d.e', subject: 's' });
    expect(await repo.countEmailsSentToday()).toBe(2);
  });

  it('enforces per-number WhatsApp cooldown and lists the manual queue', async () => {
    // feature/15: cooldown after a real send; queue shows pending manual items
    const job = makeJob();
    await repo.recordJob(job);

    await repo.recordWhatsappApplication({
      jobId: job.id,
      recipient: '5581999887766',
      sent: false,
      subject: 'Bom dia...',
      attachmentPath: 'resume.pdf',
    });
    // queued (sent=false) does not count as sent
    expect(await repo.hasWhatsappSentTo('5581999887766', 30)).toBe(false);
    const queue = await repo.listWhatsappQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ recipient: '5581999887766', subject: 'Bom dia...' });

    await repo.recordWhatsappApplication({ jobId: job.id, recipient: '5581999887766', sent: true });
    expect(await repo.hasWhatsappSentTo('5581999887766', 30)).toBe(true);
    expect(await repo.hasWhatsappSentTo('5581000000000', 30)).toBe(false);
  });
});
