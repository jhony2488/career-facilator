import { JobRepository } from '../../src/db/repository';
import { makeJob } from '../helpers/factories';

describe('JobRepository — deduplicação em 3 níveis (SQLite real)', () => {
  let repo: JobRepository;

  beforeEach(() => {
    repo = new JobRepository(':memory:');
  });

  afterEach(() => {
    repo.close();
  });

  it('detecta duplicata por URL canônica ignorando parâmetros de rastreamento', async () => {
    // feature/02: Bloqueio por URL Canônica + normalização de tracking params
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

  it('detecta a mesma vaga em plataformas diferentes pelo hash de conteúdo', async () => {
    // feature/02: Bloqueio por Hash de Conteúdo (cross-platform)
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

  it('não trata como duplicata vaga da mesma empresa com conteúdo diferente', async () => {
    // feature/02: Permitir vaga com título igual mas conteúdo diferente
    await repo.recordJob(makeJob({ title: 'Backend Engineer' }));

    const verdict = await repo.dedupCheck({
      url: 'https://boards.greenhouse.io/techcorp/jobs/456',
      company: 'TechCorp',
      title: 'Backend Engineer',
      descriptionMarkdown: 'DevOps role description completely different from before...',
    });

    expect(verdict.duplicate).toBe(false);
  });

  it('bloqueia por cooldown quando já houve candidatura recente na empresa', async () => {
    // feature/02: Bloquear nova candidatura dentro do cooldown por empresa
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

  it('não conta candidaturas SKIPPED no cooldown por empresa', async () => {
    // DECISOES.md sugestão #3: cooldown conta apenas envios efetivos
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

  it('persiste a transição de estados da máquina de candidatura', async () => {
    // feature/04: máquina de estados DISCOVERED → ... → APPLIED
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
