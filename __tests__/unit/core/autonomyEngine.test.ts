import { decideApplicationRoute } from '../../../src/core/autonomyEngine';
import { makeConfig } from '../../helpers/factories';

const baseSignals = { hasCaptcha: false, hasLowConfidenceAnswers: false };

describe('decideApplicationRoute — matriz modo × score', () => {
  const config = makeConfig();

  it.each([
    // feature/07: Roteamento por modo e score
    ['HYBRID_THRESHOLD', 90, 'AUTO_SEND'],
    ['HYBRID_THRESHOLD', 88, 'AUTO_SEND'],
    ['HYBRID_THRESHOLD', 87, 'REVIEW'],
    ['HYBRID_THRESHOLD', 80, 'REVIEW'],
    ['SEMI_AUTO', 90, 'REVIEW'],
    ['SEMI_AUTO', 75, 'REVIEW'],
    ['FULL_AUTO', 90, 'AUTO_SEND'],
    ['FULL_AUTO', 88, 'AUTO_SEND'],
  ] as const)('modo %s com score %i → %s', (mode, fitScore, expected) => {
    const route = decideApplicationRoute({
      fitScore,
      mode,
      signals: baseSignals,
      config,
      dailyCount: 0,
    });

    expect(route).toBe(expected);
  });

  it('FULL_AUTO abaixo do limiar não envia sozinho', () => {
    const route = decideApplicationRoute({
      fitScore: 80,
      mode: 'FULL_AUTO',
      signals: baseSignals,
      config,
      dailyCount: 0,
    });

    expect(route).not.toBe('AUTO_SEND');
  });

  it('CAPTCHA bloqueia envio automático mesmo com score alto', () => {
    // feature/07: CAPTCHA bloqueia o envio automático mesmo com score alto
    const route = decideApplicationRoute({
      fitScore: 95,
      mode: 'FULL_AUTO',
      signals: { ...baseSignals, hasCaptcha: true },
      config,
      dailyCount: 0,
    });

    expect(route).toBe('ESCALATE');
  });

  it('resposta com confiança baixa bloqueia o envio automático', () => {
    // feature/07: Pergunta com confiança baixa bloqueia o envio automático
    const route = decideApplicationRoute({
      fitScore: 95,
      mode: 'HYBRID_THRESHOLD',
      signals: { ...baseSignals, hasLowConfidenceAnswers: true },
      config,
      dailyCount: 0,
    });

    expect(route).toBe('REVIEW');
  });

  it('limite diário atingido adia o envio', () => {
    // feature/07: Respeitar o limite diário de candidaturas
    const route = decideApplicationRoute({
      fitScore: 95,
      mode: 'FULL_AUTO',
      signals: baseSignals,
      config,
      dailyCount: config.execution.maxDailyApplications,
    });

    expect(route).toBe('DEFER');
  });
});
