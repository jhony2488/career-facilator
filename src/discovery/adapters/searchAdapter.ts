import type { SourceAdapter, SourceAdapterContext, DiscoveryResult } from '../types';

export const searchAdapter: SourceAdapter = {
  name: 'search',
  async discover(ctx: SourceAdapterContext): Promise<DiscoveryResult> {
    const start = Date.now();
    return {
      jobs: [],
      errors: [
        {
          sourceId: ctx.source.id,
          phase: 'unknown',
          message: `Search/dork adapter for ${ctx.source.name} is not implemented in this version.`,
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
