import type { SourceAdapter, SourceAdapterContext, DiscoveryResult } from '../types';

export const atsAdapter: SourceAdapter = {
  name: 'ats',
  async discover(ctx: SourceAdapterContext): Promise<DiscoveryResult> {
    const start = Date.now();
    return {
      jobs: [],
      errors: [
        {
          sourceId: ctx.source.id,
          phase: 'unknown',
          message: `ATS adapter for ${ctx.source.name} is not implemented in this version. Configure company slugs or enable search fallback to discover ATS-hosted jobs.`,
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
