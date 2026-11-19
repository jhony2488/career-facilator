import { detectBlockingSignal, escalate, resumeAfterEscalation } from '../../src/core/escalationHandler';
import { fakePageState, mockVault } from '../helpers/mocks';

describe('Escalonamento humano: detecção → NEEDS_HUMAN_INPUT → retomada', () => {
  it('detecta CAPTCHA e escala sem inventar dados', async () => {
    // feature/09: Escalonar ao detectar verificação anti-robô
    const page = fakePageState({ hasCaptcha: true });
    const signal = detectBlockingSignal(page);

    expect(signal?.kind).toBe('CAPTCHA');

    const outcome = await escalate(page, signal!);
    expect(outcome.status).toBe('NEEDS_HUMAN_INPUT');
    expect(outcome.progressPreserved).toBe(true);
  });

  it('detecta etapa de OTP por e-mail e preserva estado para retomada', async () => {
    // feature/09: Escalonar ao detectar código de verificação por e-mail
    const page = fakePageState({ requiresEmailOtp: true });
    const signal = detectBlockingSignal(page);

    expect(signal?.kind).toBe('EMAIL_OTP');

    const outcome = await escalate(page, signal!);
    expect(outcome.status).toBe('NEEDS_HUMAN_INPUT');
    expect(outcome.savedPageState).toBeDefined();
  });

  it('escala quando encontra campo obrigatório desconhecido', async () => {
    // feature/09: nenhum dado é inventado para campo desconhecido
    const page = fakePageState({
      fields: [{ kind: 'input', label: 'Codename XQ-42', required: true }],
    });
    const signal = detectBlockingSignal(page, { unmatchedRequiredLabels: ['Codename XQ-42'] });

    expect(signal?.kind).toBe('UNKNOWN_REQUIRED_FIELD');
  });

  it('detecta sessão expirada e escala para novo login', async () => {
    // feature/11: Solicitar novo login quando a sessão expirou
    const page = fakePageState({ url: 'https://linkedin.com/login' });
    const vault = mockVault();
    vault.getSessionState.mockResolvedValue(null);

    const signal = detectBlockingSignal(page, { sessionState: null });
    expect(signal?.kind).toBe('SESSION_EXPIRED');
  });

  it('retoma o fluxo do ponto de parada após resolução humana', async () => {
    // feature/09: Retomar o fluxo após resolução humana
    const page = fakePageState({ hasCaptcha: true, currentStep: 2, totalSteps: 4 });
    const signal = detectBlockingSignal(page)!;
    const outcome = await escalate(page, signal);

    const resumed = await resumeAfterEscalation(outcome.savedPageState, { humanResolved: true });

    expect(resumed.continueFromStep).toBe(2);
    expect(resumed.status).not.toBe('NEEDS_HUMAN_INPUT');
  });
});
