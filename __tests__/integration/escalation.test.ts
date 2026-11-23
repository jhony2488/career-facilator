import {
  detectBlockingSignal,
  escalate,
  resumeAfterEscalation,
} from '../../src/core/escalationHandler';
import { readAnswers } from '../../src/autofill/answersStore';
import { runApplicationPipeline } from '../../src/core/pipeline';
import {
  fakePageState,
  mockRepo,
  mockTailorModel,
  mockTriageModel,
  mockVault,
} from '../helpers/mocks';
import { makeConfig, makeMasterProfile } from '../helpers/factories';
import { SAMPLE_JOB_HTML } from '../helpers/fixtures';

describe('Human escalation: detection → NEEDS_HUMAN_INPUT → resumption', () => {
  it('detects CAPTCHA and escalates without inventing data', async () => {
    // feature/09: Escalate upon detecting anti-bot verification
    const page = fakePageState({ hasCaptcha: true });
    const signal = detectBlockingSignal(page);

    expect(signal?.kind).toBe('CAPTCHA');

    const outcome = await escalate(page, signal!);
    expect(outcome.status).toBe('NEEDS_HUMAN_INPUT');
    expect(outcome.progressPreserved).toBe(true);
  });

  it('detects a login wall and escalates for manual authentication', async () => {
    // feature/09: portal login wall → escalation for human sign-in
    const page = { ...fakePageState(), requiresLogin: true };
    const signal = detectBlockingSignal(page);

    expect(signal?.kind).toBe('LOGIN_REQUIRED');
  });

  it('detects an email OTP step and preserves state for resumption', async () => {
    // feature/09: Escalate upon detecting an email verification code
    const page = fakePageState({ requiresEmailOtp: true });
    const signal = detectBlockingSignal(page);

    expect(signal?.kind).toBe('EMAIL_OTP');

    const outcome = await escalate(page, signal!);
    expect(outcome.status).toBe('NEEDS_HUMAN_INPUT');
    expect(outcome.savedPageState).toBeDefined();
  });

  it('escalates when it encounters an unknown required field', async () => {
    // feature/09: no data is invented for an unknown field
    const page = fakePageState({
      fields: [{ kind: 'input', label: 'Codename XQ-42', required: true }],
    });
    const signal = detectBlockingSignal(page, { unmatchedRequiredLabels: ['Codename XQ-42'] });

    expect(signal?.kind).toBe('UNKNOWN_REQUIRED_FIELD');
  });

  it('detects an expired session and escalates for a new login', async () => {
    // feature/11: Request a new login when the session has expired
    const page = fakePageState({ url: 'https://linkedin.com/login' });
    const vault = mockVault();
    vault.getSessionState.mockResolvedValue(null);

    const signal = detectBlockingSignal(page, { sessionState: null });
    expect(signal?.kind).toBe('SESSION_EXPIRED');
  });

  it('resumes the flow from the stopping point after human resolution', async () => {
    // feature/09: Resume the flow after human resolution
    const page = fakePageState({ hasCaptcha: true, currentStep: 2, totalSteps: 4 });
    const signal = detectBlockingSignal(page)!;
    const outcome = await escalate(page, signal);

    const resumed = await resumeAfterEscalation(outcome.savedPageState, { humanResolved: true });

    expect(resumed.continueFromStep).toBe(2);
    expect(resumed.status).not.toBe('NEEDS_HUMAN_INPUT');
  });
});

describe('Human escalation: onHumanEscalation handoff (feature/09)', () => {
  it('hands CAPTCHA to the visible-escalation callback with signal + refill payload', async () => {
    // feature/09: visible escalation — caller may reopen the page for the human
    const page = fakePageState({ hasCaptcha: true });
    const onHumanEscalation = jest.fn().mockResolvedValue(true);

    const result = await runApplicationPipeline(
      {
        rawJobs: [{ html: SAMPLE_JOB_HTML, url: 'https://boards.greenhouse.io/cap/jobs/9' }],
        profile: makeMasterProfile(),
        config: makeConfig(),
      },
      {
        repo: mockRepo(),
        triageModel: mockTriageModel({ fitScore: 95 }),
        tailorModel: mockTailorModel(),
        pageFactory: () => page,
        onHumanEscalation,
      },
    );

    expect(result.applications[0].status).toBe('NEEDS_HUMAN_INPUT');
    expect(onHumanEscalation).toHaveBeenCalledTimes(1);
    const handoff = onHumanEscalation.mock.calls[0][0] as {
      page: unknown;
      signal: { kind: string };
      matched: unknown[];
      aiAnswers: Record<string, string>;
    };
    expect(handoff.page).toBe(page);
    expect(handoff.signal.kind).toBe('CAPTCHA');
    expect(Array.isArray(handoff.matched)).toBe(true);
    expect(handoff.aiAnswers).toBeDefined();
  });

  it('hands a login wall to the callback with LOGIN_REQUIRED for visible sign-in', async () => {
    // feature/09: login-required pages reopen visibly for manual authentication
    const page = { ...fakePageState(), requiresLogin: true };
    const onHumanEscalation = jest.fn().mockResolvedValue(true);

    const result = await runApplicationPipeline(
      {
        rawJobs: [{ html: SAMPLE_JOB_HTML, url: 'https://linkedin.com/jobs/view/77' }],
        profile: makeMasterProfile(),
        config: makeConfig(),
      },
      {
        repo: mockRepo(),
        triageModel: mockTriageModel({ fitScore: 95 }),
        tailorModel: mockTailorModel(),
        pageFactory: () => page,
        onHumanEscalation,
      },
    );

    expect(result.applications[0].status).toBe('NEEDS_HUMAN_INPUT');
    expect(onHumanEscalation).toHaveBeenCalledTimes(1);
    const handoff = onHumanEscalation.mock.calls[0][0] as { signal: { kind: string } };
    expect(handoff.signal.kind).toBe('LOGIN_REQUIRED');
  });

  it('does NOT call the callback for non-visible blockers (unknown required field)', async () => {
    // feature/09: UNKNOWN_REQUIRED_FIELD escalates but has nothing to reopen visually
    const page = fakePageState({
      fields: [{ kind: 'input', label: 'Codename XQ-42', required: true }],
    });
    const onHumanEscalation = jest.fn().mockResolvedValue(true);

    const result = await runApplicationPipeline(
      {
        rawJobs: [{ html: SAMPLE_JOB_HTML, url: 'https://boards.greenhouse.io/unk/jobs/10' }],
        profile: makeMasterProfile(),
        config: makeConfig(),
      },
      {
        repo: mockRepo(),
        triageModel: mockTriageModel({ fitScore: 95 }),
        tailorModel: mockTailorModel(),
        pageFactory: () => page,
        onHumanEscalation,
      },
    );

    expect(result.applications[0].status).toBe('NEEDS_HUMAN_INPUT');
    expect(onHumanEscalation).not.toHaveBeenCalled();
  });

  it('hands unanswered questions to the callback when a live page has them', async () => {
    // feature/09/06 (decisão #39): questions the live model could not answer
    // reopen the form visibly — the human answers in the window and submits
    const el = {
      click: jest.fn(async () => {
        throw new Error('not clickable');
      }),
      check: jest.fn(async () => {}),
      fill: jest.fn(async () => {}),
      innerText: jest.fn(async () => ''),
      getAttribute: jest.fn(async () => null),
    };
    const first = () => el;
    const scope = {
      locator: jest.fn(() => ({ first, filter: () => ({ first }) })),
      getByRole: jest.fn(() => ({ first, filter: () => ({ first }) })),
      getByLabel: jest.fn(() => ({ first, filter: () => ({ first }) })),
      getByText: jest.fn(() => ({ first, filter: () => ({ first }) })),
    };
    const dom = {
      frames: () => [scope],
      locator: scope.locator,
      getByRole: scope.getByRole,
      getByLabel: scope.getByLabel,
      getByText: scope.getByText,
      url: () => 'https://x.job/apply',
      waitForTimeout: jest.fn(async () => {}),
    };
    const page = {
      ...fakePageState({
        fields: [
          {
            kind: 'input',
            label: 'Codename XQ-42',
            required: true,
            selector: '[data-cf-idx="0"]',
          },
        ],
      }),
      dom,
    };
    const onHumanEscalation = jest.fn().mockResolvedValue(true);
    const answerQuestions = jest.fn(async () => null);

    const result = await runApplicationPipeline(
      {
        rawJobs: [{ html: SAMPLE_JOB_HTML, url: 'https://boards.greenhouse.io/unk/jobs/11' }],
        profile: makeMasterProfile(),
        config: makeConfig(),
      },
      {
        repo: mockRepo(),
        triageModel: mockTriageModel({ fitScore: 95 }),
        tailorModel: mockTailorModel(),
        pageFactory: () => page,
        onHumanEscalation,
        answerQuestions,
      },
    );

    expect(result.applications[0].status).toBe('NEEDS_HUMAN_INPUT');
    expect(answerQuestions).toHaveBeenCalledTimes(1);
    expect(onHumanEscalation).toHaveBeenCalledTimes(1);
    const handoff = onHumanEscalation.mock.calls[0][0] as {
      signal: { kind: string };
      unansweredLabels?: string[];
    };
    expect(handoff.signal.kind).toBe('UNKNOWN_REQUIRED_FIELD');
    expect(handoff.unansweredLabels).toEqual(['Codename XQ-42']);
  });

  it('fills out-of-scope questions via the live resolver and pauses for review', async () => {
    // feature/06 (decisão #39): required answered only by the live model
    // ⇒ anti-fabrication pauses before submit; answer persists to the sidecar
    const page = fakePageState({
      fields: [{ kind: 'input', label: 'Codename XQ-42', required: true }],
    });
    const answerQuestions = jest.fn(async () => ({ 'Codename XQ-42': 'XZ-1' }));

    const result = await runApplicationPipeline(
      {
        rawJobs: [{ html: SAMPLE_JOB_HTML, url: 'https://boards.greenhouse.io/live/jobs/12' }],
        profile: makeMasterProfile(),
        config: makeConfig(),
      },
      {
        repo: mockRepo(),
        triageModel: mockTriageModel({ fitScore: 95 }),
        tailorModel: mockTailorModel(),
        pageFactory: () => page,
        answerQuestions,
      },
    );

    expect(answerQuestions).toHaveBeenCalledTimes(1);
    expect(result.applications[0].status).toBe('READY_TO_REVIEW');
    const resumePath = result.applications[0].resumePath;
    expect(resumePath).toBeTruthy();
    expect(readAnswers(resumePath)['Codename XQ-42']).toBe('XZ-1');
  });
});
