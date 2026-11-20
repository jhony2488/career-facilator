import { decideApplicationRoute } from '../../../src/core/autonomyEngine';
import { makeConfig } from '../../helpers/factories';

const baseSignals = { hasCaptcha: false, hasLowConfidenceAnswers: false };

describe('decideApplicationRoute — mode × score matrix', () => {
  const config = makeConfig();

  it.each([
    // feature/07: Routing by mode and score
    ['HYBRID_THRESHOLD', 90, 'AUTO_SEND'],
    ['HYBRID_THRESHOLD', 88, 'AUTO_SEND'],
    ['HYBRID_THRESHOLD', 87, 'REVIEW'],
    ['HYBRID_THRESHOLD', 80, 'REVIEW'],
    ['SEMI_AUTO', 90, 'REVIEW'],
    ['SEMI_AUTO', 75, 'REVIEW'],
    ['FULL_AUTO', 90, 'AUTO_SEND'],
    ['FULL_AUTO', 88, 'AUTO_SEND'],
  ] as const)('mode %s with score %i → %s', (mode, fitScore, expected) => {
    const route = decideApplicationRoute({
      fitScore,
      mode,
      signals: baseSignals,
      config,
      dailyCount: 0,
    });

    expect(route).toBe(expected);
  });

  it('FULL_AUTO below the threshold does not send on its own', () => {
    const route = decideApplicationRoute({
      fitScore: 80,
      mode: 'FULL_AUTO',
      signals: baseSignals,
      config,
      dailyCount: 0,
    });

    expect(route).not.toBe('AUTO_SEND');
  });

  it('CAPTCHA blocks auto-send even with a high score', () => {
    // feature/07: CAPTCHA blocks auto-send even with a high score
    const route = decideApplicationRoute({
      fitScore: 95,
      mode: 'FULL_AUTO',
      signals: { ...baseSignals, hasCaptcha: true },
      config,
      dailyCount: 0,
    });

    expect(route).toBe('ESCALATE');
  });

  it('a low-confidence answer blocks auto-send', () => {
    // feature/07: A low-confidence question blocks auto-send
    const route = decideApplicationRoute({
      fitScore: 95,
      mode: 'HYBRID_THRESHOLD',
      signals: { ...baseSignals, hasLowConfidenceAnswers: true },
      config,
      dailyCount: 0,
    });

    expect(route).toBe('REVIEW');
  });

  it('reaching the daily limit defers sending', () => {
    // feature/07: Respect the daily application limit
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
