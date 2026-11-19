import { TokenTracker } from '../../../src/ai/tokenTracker';

describe('TokenTracker — telemetria de custo', () => {
  it('acumula tokens de entrada e saída por execução', () => {
    // doc 03: logs de tokens gastos por execução
    const tracker = new TokenTracker();
    tracker.record({ tier: 'LOCAL', inputTokens: 900, outputTokens: 120, cachedTokens: 0 });
    tracker.record({ tier: 'SMART', inputTokens: 5000, outputTokens: 800, cachedTokens: 4000 });

    const totals = tracker.totals();
    expect(totals.inputTokens).toBe(5900);
    expect(totals.outputTokens).toBe(920);
  });

  it('estima a economia de tokens por prompt caching', () => {
    // doc 03: desconto de 75-90% nos tokens de entrada das vagas seguintes
    const tracker = new TokenTracker();
    tracker.record({ tier: 'SMART', inputTokens: 5000, outputTokens: 800, cachedTokens: 0 });
    tracker.record({ tier: 'SMART', inputTokens: 5000, outputTokens: 800, cachedTokens: 4500 });

    const savings = tracker.savingsEstimate();
    expect(savings.cachedTokens).toBe(4500);
    expect(savings.savedRatio).toBeGreaterThan(0.4);
  });

  it('zera os acumuladores por execução nova', () => {
    const tracker = new TokenTracker();
    tracker.record({ tier: 'LOCAL', inputTokens: 100, outputTokens: 10, cachedTokens: 0 });
    tracker.reset();

    expect(tracker.totals().inputTokens).toBe(0);
  });
});
