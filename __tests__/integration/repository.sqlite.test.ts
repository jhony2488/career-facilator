import { JobRepository } from '../../src/db/repository';
import { makeJob } from '../helpers/factories';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

  it('resolves a job by id, raw url or canonical url', async () => {
    // manual marking commands accept any of the three references
    const job = makeJob();
    await repo.recordJob(job);

    expect((await repo.findJob(job.id))?.id).toBe(job.id);
    expect((await repo.findJob(job.url))?.id).toBe(job.id);
    expect((await repo.findJob(`${job.canonicalUrl}?utm_source=feed`))?.id).toBe(job.id);
    expect(await repo.findJob('https://example.com/nowhere')).toBeUndefined();
  });

  it('deletes a job together with its application records', async () => {
    // deleteJob clears the manual queue entry and makes the URL reprocessable
    const job = makeJob();
    await repo.recordJob(job);
    await repo.recordWhatsappApplication({
      jobId: job.id,
      recipient: '5581999887766',
      sent: false,
    });

    expect(await repo.deleteJob(job.canonicalUrl)).toBe(true);
    expect(await repo.getByUrl(job.canonicalUrl)).toBeUndefined();
    expect(await repo.listWhatsappQueue()).toHaveLength(0);
    expect(await repo.deleteJob(job.canonicalUrl)).toBe(false);
  });

  it('confirms a manual WhatsApp send from the queue and activates the cooldown', async () => {
    // feature/15: after sending by hand, markChannelSent flips the pending row
    const job = makeJob();
    await repo.recordJob(job);
    await repo.recordWhatsappApplication({
      jobId: job.id,
      recipient: '5581999887766',
      sent: false,
      subject: 'Bom dia...',
    });

    await repo.markChannelSent(job.id, 'WHATSAPP');

    expect(await repo.listWhatsappQueue()).toHaveLength(0);
    expect(await repo.hasWhatsappSentTo('5581999887766', 30)).toBe(true);
  });

  it('records a manual channel send even without a pending queue row', async () => {
    // manual send done outside the app still counts toward the daily cap
    const job = makeJob();
    await repo.recordJob(job);

    await repo.markChannelSent(job.id, 'EMAIL');

    expect(await repo.countEmailsSentToday()).toBe(1);
  });

  it('persists pending context on NEEDS_HUMAN_INPUT and clears it on the next status', async () => {
    // decisão #42: reason/final url/detail make the review queue actionable
    const job = makeJob();
    await repo.recordJob(job);

    await repo.updateStatus(job.url, 'NEEDS_HUMAN_INPUT', undefined, {
      reason: 'UNKNOWN_REQUIRED_FIELD',
      url: 'https://boards.greenhouse.io/techcorp/form',
      detail: 'Perguntas sem resposta: Visa sponsor?',
    });

    let stored = await repo.getByUrl(job.url);
    expect(stored?.status).toBe('NEEDS_HUMAN_INPUT');
    expect(stored?.pendingReason).toBe('UNKNOWN_REQUIRED_FIELD');
    expect(stored?.pendingUrl).toContain('/form');
    expect(stored?.pendingDetail).toContain('Visa sponsor');
    expect((await repo.listByStatus('NEEDS_HUMAN_INPUT'))[0].pendingReason).toBe(
      'UNKNOWN_REQUIRED_FIELD',
    );

    await repo.updateStatus(job.url, 'APPLIED');
    stored = await repo.getByUrl(job.url);
    expect(stored?.pendingReason).toBeNull();
    expect(stored?.pendingUrl).toBeNull();
    expect(stored?.pendingDetail).toBeNull();
  });

  it('migrates a pre-pending-columns jobs table in place', async () => {
    // CREATE IF NOT EXISTS não altera DB antigo — o construtor faz ALTER TABLE
    const dir = mkdtempSync(join(tmpdir(), 'career-repo-'));
    const dbPath = join(dir, 'jobs.sqlite');
    const old = new DatabaseSync(dbPath);
    old.exec(`CREATE TABLE jobs (
      id TEXT PRIMARY KEY, url TEXT NOT NULL, canonical_url TEXT NOT NULL UNIQUE,
      content_hash TEXT NOT NULL, source TEXT NOT NULL, company TEXT NOT NULL,
      title TEXT NOT NULL, description_markdown TEXT NOT NULL, scope TEXT NOT NULL,
      status TEXT NOT NULL, discovered_at TEXT NOT NULL, applied_at TEXT,
      resume_path TEXT, applied_skills TEXT)`);
    old.prepare(
      `INSERT INTO jobs (id, url, canonical_url, content_hash, source, company, title,
        description_markdown, scope, status, discovered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'j1',
      'https://x/job/1',
      'https://x/job/1',
      'hash1',
      'src',
      'Acme',
      'Dev',
      'desc',
      'NATIONAL',
      'DISCOVERED',
      '2026-11-24T00:00:00.000Z',
    );
    old.close();

    const migrated = new JobRepository(dbPath);
    try {
      await migrated.updateStatus('https://x/job/1', 'NEEDS_HUMAN_INPUT', undefined, {
        reason: 'CAPTCHA',
        url: 'https://x/job/1/captcha',
      });
      const stored = await migrated.findJob('https://x/job/1');
      expect(stored?.pendingReason).toBe('CAPTCHA');
      expect(stored?.pendingUrl).toContain('captcha');
    } finally {
      migrated.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
