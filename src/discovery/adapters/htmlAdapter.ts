import type {
  SourceAdapter,
  SourceAdapterContext,
  DiscoveryResult,
  DiscoveryError,
  ExtractedJob,
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

/**
 * URLs de listagem da fonte: com `{query}` no template, uma URL por título
 * alvo (cap 3 — cada página custa uma extração LLM); sem `{query}`, uma só.
 */
function listingUrls(
  source: SourceAdapterContext['source'],
  titles: string[],
): string[] {
  const tpl = source.searchUrlTemplate;
  if (!tpl) return source.url ? [source.url] : [];
  if (!tpl.includes('{query}')) {
    return [tpl.replace('{page}', '1').replace('{location}', 'remote')];
  }
  const terms = titles.map((t) => t.trim()).filter(Boolean).slice(0, 3);
  const queries = terms.length ? terms : ['developer'];
  return queries.map((q) =>
    tpl
      .replace('{query}', encodeURIComponent(q))
      .replace('{page}', '1')
      .replace('{location}', 'remote'),
  );
}

export const htmlAdapter: SourceAdapter = {
  name: 'html',
  async discover(ctx: SourceAdapterContext): Promise<DiscoveryResult> {
    const start = Date.now();
    const { source, config, fetcher, maxJobs, extract } = ctx;

    const urls = listingUrls(source, config.discovery.targetTitles);
    if (!urls.length) {
      return fail(ctx, 'unknown', `Source ${source.id} has no listing URL configured`, start);
    }
    if (!config.discovery.useGenericHtmlFallback || !extract) {
      return fail(
        ctx,
        'unknown',
        `Generic HTML scraping for ${source.name} requires DISCOVERY_USE_GENERIC_FALLBACK=true`,
        start,
        urls[0],
      );
    }

    const errors: DiscoveryError[] = [];
    const extracted: ExtractedJob[] = [];
    for (const targetUrl of urls) {
      if (extracted.length >= maxJobs || ctx.signal?.aborted) break;
      let page;
      try {
        page = await fetcher.fetchText(targetUrl);
      } catch (e) {
        errors.push({
          sourceId: source.id,
          phase: 'connect',
          message: e instanceof Error ? e.message : String(e),
          url: targetUrl,
        });
        continue;
      }
      if (page.status !== 200) {
        errors.push({
          sourceId: source.id,
          phase: 'connect',
          message: `HTTP ${page.status} from ${targetUrl}`,
          url: targetUrl,
        });
        continue;
      }
      try {
        extracted.push(...(await extract(page.text, page.url, maxJobs - extracted.length)));
      } catch (e) {
        errors.push({
          sourceId: source.id,
          phase: 'parse',
          message: `LLM extraction failed: ${e instanceof Error ? e.message : String(e)}`,
          url: targetUrl,
        });
      }
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
      errors,
      meta: {
        sourcesTried: urls.length,
        sourcesSucceeded: extracted.length > 0 ? 1 : 0,
        totalRaw: extracted.length,
        afterDedup: jobs.length,
        afterFilters: jobs.length,
        durationMs: Date.now() - start,
      },
    };
  },
};
