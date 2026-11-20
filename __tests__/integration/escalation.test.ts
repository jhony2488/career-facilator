import {
  detectBlockingSignal,
  escalate,
  resumeAfterEscalation,
} from '../../src/core/escalationHandler';
import { fakePageState, mockVault } from '../helpers/mocks';

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
