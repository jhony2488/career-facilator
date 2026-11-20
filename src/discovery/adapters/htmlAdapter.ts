import type {
  SourceAdapter,
  SourceAdapterContext,
  DiscoveryResult,
  DiscoveryError,
} from '../types';
import { rawJobFromNormalized, matchesTargetTitles } from '../normalizer';

function fail(
  ctx: SourceAdapterContext,
  phase: DiscoveryError['phase'],
  message: string,
  start: number,
  url?: string,
): DiscoveryResult {
  return {
    jobs: [],
    errors: [{ sourceId: ctx.source.id, phase, message, url }],
    meta: {
      sourcesTried: 1,
      sourcesSucceeded: 0,
      totalRaw: 0,
      afterDedup: 0,
      afterFilters: 0,
      durationMs: Date.now() - start,
    },
  };
}

function listingUrl(source: SourceAdapterContext['source'], titles: string[]): string | undefined {
  if (source.searchUrlTemplate) {
    const query = encodeURIComponent(titles[0] ?? 'developer');
    return source.searchUrlTemplate
      .replace('{query}', query)
      .replace('{page}', '1')
      .replace('{location}', 'remote');
  }
  return source.url;
}

export const htmlAdapter: SourceAdapter = {
  name: 'html',
  async discover(ctx: SourceAdapterContext): Promise<DiscoveryResult> {
    const start = Date.now();
    const { source, config, fetcher, maxJobs, extract } = ctx;

    const targetUrl = listingUrl(source, config.discovery.targetTitles);
    if (!targetUrl) {
      return fail(ctx, 'unknown', `Source ${source.id} has no listing URL configured`, start);
    }
    if (!config.discovery.useGenericHtmlFallback || !extract) {
      return fail(
        ctx,
        'unknown',
        `Generic HTML scraping for ${source.name} requires DISCOVERY_USE_GENERIC_FALLBACK=true`,
        start,
        targetUrl,
      );
    }

    let page;
    try {
      page = await fetcher.fetchText(targetUrl);
    } catch (e) {
      return fail(ctx, 'connect', e instanceof Error ? e.message : String(e), start, targetUrl);
    }
    if (page.status !== 200) {
      return fail(ctx, 'connect', `HTTP ${page.status} from ${targetUrl}`, start, targetUrl);
    }

    let extracted;
    try {
      extracted = await extract(page.text, page.url, maxJobs);
    } catch (e) {
      return fail(
        ctx,
        'parse',
        `LLM extraction failed: ${e instanceof Error ? e.message : String(e)}`,
        start,
        targetUrl,
      );
    }

    const jobs = extracted
      .filter((j) => matchesTargetTitles(j.title, config.discovery.targetTitles))
      .map((j) =>
        rawJobFromNormalized(
          {
            url: j.url,
            title: j.title,
            company: j.company,
            location: j.location,
            descriptionMarkdown: j.description,
          },
          source.name,
          source.id,
        ),
      );

    return {
      jobs,
      errors: [],
      meta: {
        sourcesTried: 1,
        sourcesSucceeded: 1,
        totalRaw: extracted.length,
        afterDedup: jobs.length,
        afterFilters: jobs.length,
        durationMs: Date.now() - start,
      },
    };
  },
};
