import { runApplicationPipeline } from '../../src/core/pipeline';
import { makeJob, makeMasterProfile, makeConfig } from '../helpers/factories';
import {
  mockRepo,
  mockTriageModel,
  mockTailorModel,
  mockSmtpTransport,
  mockVault,
  fakePageState,
} from '../helpers/mocks';
import { INTL_JOB_DESCRIPTION, SAMPLE_JOB_HTML } from '../helpers/fixtures';

/**
 * E2E: discovery → dedup → eligibility → triage → skills → tailor → autofill →
 * revisão humana → APPLIED. Todas as dependências externas são mockadas.
 */
describe('Pipeline completo — caminho feliz (SEMI_AUTO com aprovação humana)', () => {
  it('processa uma vaga de ponta a ponta até APPLIED', async () => {
    // features 01–07: ciclo completo de candidatura
    const repo = mockRepo();
    const config = makeConfig();
    config.execution.mode = 'SEMI_AUTO';

    const result = await runApplicationPipeline(
      {
        rawJobs: [{ html: SAMPLE_JOB_HTML, url: 'https://boards.greenhouse.io/techcorp/jobs/123?utm_source=x' }],
        profile: makeMasterProfile(),
        config,
      },
      {
        repo,
        triageModel: mockTriageModel({ fitScore: 80, matchedKeywords: ['TypeScript', 'Next.js'] }),
        tailorModel: mockTailorModel(),
        pageFactory: () => fakePageState(),
        humanApproval: () => true, // usuário aprova na revisão
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

  it('descarta vaga duplicada sem consumir nenhum token de IA', async () => {
    // feature/02: Bloqueio por URL Canônica — descarta em 0ms/0 tokens
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

  it('marca SKIPPED sem gerar currículo quando Fit Score < mínimo', async () => {
    // feature/03: score 74 → SKIPPED na fronteira
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

  it('mantém o orçamento: camada cara só roda para vagas aprovadas', async () => {
    // doc 01: apenas top ~15% das vagas chega à Camada 2
    const repo = mockRepo();
    const tailorModel = mockTailorModel();
    const triageModel = mockTriageModel();

    const jobs = [
      { html: SAMPLE_JOB_HTML, url: 'https://a.co/1' },
      { html: SAMPLE_JOB_HTML, url: 'https://a.co/2' },
      { html: SAMPLE_JOB_HTML, url: 'https://a.co/3' },
    ];
    // 1 aprovada (80), 2 reprovadas (50)
    triageModel.generate
      .mockResolvedValueOnce({ fitScore: 80, isDealbreaker: false, missingSkills: [], matchedKeywords: ['ts'], atsTitleSuggestion: 'x' })
      .mockResolvedValue({ fitScore: 50, isDealbreaker: false, missingSkills: [], matchedKeywords: [], atsTitleSuggestion: 'x' });

    const result = await runApplicationPipeline(
      { rawJobs: jobs, profile: makeMasterProfile(), config: makeConfig() },
      { repo, triageModel, tailorModel, pageFactory: () => fakePageState(), humanApproval: () => true },
    );

    expect(result.processed).toBe(3);
    expect(tailorModel.tailor).toHaveBeenCalledTimes(1);
    expect(result.tokenReport.smartTierCalls).toBe(1);
  });
});
