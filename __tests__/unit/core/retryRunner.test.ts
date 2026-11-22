import { reapplyStoredJob, type RetryDeps } from '../../../src/core/retryRunner';
import type { JobRecord } from '../../../src/db/repository';
import type { PageStateLike, PageFieldState } from '../../../src/autofill/formExecutor';
import { makeMasterProfile } from '../../helpers/factories';

const profile = makeMasterProfile();

const makeJob = (over: Partial<JobRecord> = {}): JobRecord => ({
  id: 'job-1',
  url: 'https://gupy.io/job/1',
  canonicalUrl: 'https://gupy.io/job/1',
  contentHash: 'h',
  source: 'gupy',
  company: 'ACME',
  title: 'Dev',
  descriptionMarkdown: 'desc',
  scope: 'NATIONAL',
  status: 'NEEDS_HUMAN_INPUT',
  discoveredAt: '2026-02-20',
  resumePath: 'storage/generated/resume.pdf',
  ...over,
});

const makeField = (over: Partial<PageFieldState> = {}): PageFieldState =>
  ({
    kind: 'text',
    label: 'Nome completo',
    required: true,
    ...over,
  }) as PageFieldState;

const makePage = (over: Partial<PageStateLike> = {}): PageStateLike => ({
  url: 'https://gupy.io/job/1',
  fields: [makeField()],
  hasCaptcha: false,
  requiresEmailOtp: false,
  validationErrors: [],
  alreadyAppliedBanner: false,
  currentStep: 1,
  totalSteps: 1,
  isShadowDom: false,
  submitted: false,
  ...over,
});

const makeDeps = (page: PageStateLike, over: Partial<RetryDeps> = {}) => {
  const statuses: [string, string][] = [];
  const deps: RetryDeps = {
    repo: {
      updateStatus: jest.fn((url: string, s: string) => {
        statuses.push([url, s]);
        return Promise.resolve();
      }),
    } as unknown as RetryDeps['repo'],
    pageFactory: jest.fn(() => Promise.resolve(page)),
    ...over,
  };
  return { deps, statuses };
};

describe('reapplyStoredJob — retry de vagas NEEDS_HUMAN_INPUT', () => {
  it('marks APPLIED when the page shows the already-applied banner', async () => {
    const { deps, statuses } = makeDeps(makePage({ alreadyAppliedBanner: true }));

    const r = await reapplyStoredJob(makeJob(), { profile, deps });

    expect(r.status).toBe('APPLIED');
    expect(statuses).toEqual([['https://gupy.io/job/1', 'APPLIED']]);
  });

  it('returns NEEDS_HUMAN_INPUT without touching status when the page has no web form', async () => {
    const { deps, statuses } = makeDeps(makePage({ fields: [] }));

    const r = await reapplyStoredJob(makeJob(), { profile, deps });

    expect(r).toEqual({ status: 'NEEDS_HUMAN_INPUT', reason: 'NO_WEB_FORM' });
    expect(statuses).toEqual([]);
  });

  // filled form + PAUSE_BEFORE_SUBMIT → pronto p/ revisão humana
  it('marks READY_TO_REVIEW after a clean fill on a dom-less page', async () => {
    const { deps, statuses } = makeDeps(makePage());

    const r = await reapplyStoredJob(makeJob(), { profile, deps });

    expect(r.status).toBe('READY_TO_REVIEW');
    expect(statuses).toEqual([['https://gupy.io/job/1', 'READY_TO_REVIEW']]);
  });

  // muro de login → escalação dispara a mesma malha do run (login-cofre etc.)
  it('invokes onHumanEscalation and keeps NEEDS_HUMAN_INPUT on login wall', async () => {
    const page = makePage({ requiresLogin: true });
    const onHumanEscalation = jest.fn(() => Promise.resolve(true));
    const { deps, statuses } = makeDeps(page, { onHumanEscalation });

    const r = await reapplyStoredJob(makeJob(), { profile, deps });

    expect(r.status).toBe('NEEDS_HUMAN_INPUT');
    expect(onHumanEscalation).toHaveBeenCalledWith(
      expect.objectContaining({ signal: expect.objectContaining({ kind: 'LOGIN_REQUIRED' }) }),
    );
    expect(statuses).toEqual([['https://gupy.io/job/1', 'NEEDS_HUMAN_INPUT']]);
  });

  it('marks FAILED when the page factory throws', async () => {
    const { deps, statuses } = makeDeps(makePage());
    deps.pageFactory = jest.fn(() => Promise.reject(new Error('browser crashed')));

    const r = await reapplyStoredJob(makeJob(), { profile, deps });

    expect(r.status).toBe('FAILED');
    expect(statuses).toEqual([['https://gupy.io/job/1', 'FAILED']]);
  });
});
