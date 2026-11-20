import { TokenTracker } from '../../../src/ai/tokenTracker';

describe('TokenTracker — cost telemetry', () => {
  it('accumulates input and output tokens per run', () => {
    // doc 03: logs of tokens spent per run
    const tracker = new TokenTracker();
    tracker.record({ tier: 'LOCAL', inputTokens: 900, outputTokens: 120, cachedTokens: 0 });
    tracker.record({ tier: 'SMART', inputTokens: 5000, outputTokens: 800, cachedTokens: 4000 });

    const totals = tracker.totals();
    expect(totals.inputTokens).toBe(5900);
    expect(totals.outputTokens).toBe(920);
  });

  it('estimates token savings from prompt caching', () => {
    // doc 03: 75-90% discount on input tokens for subsequent jobs
    const tracker = new TokenTracker();
    tracker.record({ tier: 'SMART', inputTokens: 5000, outputTokens: 800, cachedTokens: 0 });
    tracker.record({ tier: 'SMART', inputTokens: 5000, outputTokens: 800, cachedTokens: 4500 });

    const savings = tracker.savingsEstimate();
    expect(savings.cachedTokens).toBe(4500);
    expect(savings.savedRatio).toBeGreaterThan(0.4);
  });

  it('resets the accumulators for a new run', () => {
    const tracker = new TokenTracker();
    tracker.record({ tier: 'LOCAL', inputTokens: 100, outputTokens: 10, cachedTokens: 0 });
    tracker.reset();

    expect(tracker.totals().inputTokens).toBe(0);
  });
});
