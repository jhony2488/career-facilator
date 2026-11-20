import type { SourceAdapter, SourceAdapterContext, DiscoveryResult } from '../types';

export const linkedinAdapter: SourceAdapter = {
  name: 'linkedin',
  async discover(ctx: SourceAdapterContext): Promise<DiscoveryResult> {
    const start = Date.now();
    return {
      jobs: [],
      errors: [
        {
          sourceId: ctx.source.id,
          phase: 'unknown',
          message: `LinkedIn discovery requires an authenticated session and explicit user opt-in. Configure DISCOVERY_BROWSER_PROFILE_DIR and enable ${ctx.source.id} to use this adapter.`,
        },
      ],
      meta: {
        sourcesTried: 1,
        sourcesSucceeded: 0,
        totalRaw: 0,
        afterDedup: 0,
        afterFilters: 0,
        durationMs: Date.now() - start,
      },
    };
  },
};
