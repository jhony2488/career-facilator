export type ModelTier = 'LOCAL' | 'FAST' | 'SMART';

export interface TokenUsage {
  tier: ModelTier;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

export interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  calls: number;
}

export interface SavingsEstimate {
  cachedTokens: number;
  savedRatio: number; // cachedTokens / inputTokens
}

/** Telemetria de custo e tokens economizados por execução (doc 03). */
export class TokenTracker {
  private usages: TokenUsage[] = [];

  record(usage: TokenUsage): void {
    this.usages.push(usage);
  }

  totals(): TokenTotals {
    return this.usages.reduce<TokenTotals>(
      (acc, u) => ({
        inputTokens: acc.inputTokens + u.inputTokens,
        outputTokens: acc.outputTokens + u.outputTokens,
        cachedTokens: acc.cachedTokens + u.cachedTokens,
        calls: acc.calls + 1,
      }),
      { inputTokens: 0, outputTokens: 0, cachedTokens: 0, calls: 0 },
    );
  }

  savingsEstimate(): SavingsEstimate {
    const totals = this.totals();
    return {
      cachedTokens: totals.cachedTokens,
      savedRatio: totals.inputTokens === 0 ? 0 : totals.cachedTokens / totals.inputTokens,
    };
  }

  reset(): void {
    this.usages = [];
  }
}
