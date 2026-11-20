import type { SourceAdapter, SourceAdapterContext, DiscoveryResult } from '../types';

export const htmlAdapter: SourceAdapter = {
  name: 'html',
  async discover(ctx: SourceAdapterContext): Promise<DiscoveryResult> {
    const start = Date.now();
    return {
      jobs: [],
      errors: [
        {
          sourceId: ctx.source.id,
          phase: 'unknown',
          message: `Generic HTML scraping for ${ctx.source.name} is not implemented in this version. Use public API sources (remoteok, remotive, jobicy, arbeitnow, workingnomads, himalayas, weworkremotely).`,
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
