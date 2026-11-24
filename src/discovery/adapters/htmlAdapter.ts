import type {
  SourceAdapter,
  SourceAdapterContext,
  DiscoveryResult,
  DiscoveryError,
  ExtractedJob,
} from '../types';
import { isJobListingUrl, rawJobFromNormalized, matchesTargetTitles } from '../normalizer';

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
 * Templates de listagem da fonte: `{query}` e `{location}` resolvidos aqui —
 * `{page}` permanece p/ o loop de paginação (1..listingMaxPages até a página
 * vir vazia ou só com vagas já vistas). Com `{query}`, um template por título
 * alvo (cap 3 — cada página custa uma extração LLM).
 */
function listingTemplates(source: SourceAdapterContext['source'], titles: string[]): string[] {
  const tpl = source.searchUrlTemplate;
  if (!tpl) return source.url ? [source.url] : [];
  const withLocation = (t: string) => t.replace('{location}', 'remote');
  if (!tpl.includes('{query}')) {
    return [withLocation(tpl)];
  }
  const terms = titles
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 3);
  const queries = terms.length ? terms : ['developer'];
  return queries.map((q) => withLocation(tpl.replace('{query}', encodeURIComponent(q))));
}

export const htmlAdapter: SourceAdapter = {
  name: 'html',
  async discover(ctx: SourceAdapterContext): Promise<DiscoveryResult> {
    const start = Date.now();
    const { source, config, fetcher, maxJobs, extract } = ctx;

    const templates = listingTemplates(source, config.discovery.targetTitles);
    if (!templates.length) {
      return fail(ctx, 'unknown', `Source ${source.id} has no listing URL configured`, start);
    }
    if (!config.discovery.useGenericHtmlFallback || !extract) {
      return fail(
        ctx,
        'unknown',
        `Generic HTML scraping for ${source.name} requires DISCOVERY_USE_GENERIC_FALLBACK=true`,
        start,
        templates[0].replace('{page}', '1'),
      );
    }

    const errors: DiscoveryError[] = [];
    const extracted: ExtractedJob[] = [];
    const seenUrls = new Set<string>();
    const maxPages = Math.max(1, config.discovery.listingMaxPages ?? 4);
    outer: for (const tpl of templates) {
      // `{page}` no template → pagina até a extração vir vazia ou só repetida.
      const pages = tpl.includes('{page}') ? maxPages : 1;
      for (let pageIdx = 1; pageIdx <= pages; pageIdx++) {
        if (extracted.length >= maxJobs || ctx.signal?.aborted) break outer;
        const targetUrl = tpl.replace('{page}', String(pageIdx));
        let page;
        try {
          // SPA/render:true → browser persistente (reusa login do usuário);
          // demais seguem no fetcher HTTP de sempre.
          page =
            source.render && ctx.renderText
              ? await ctx.renderText(targetUrl)
              : await fetcher.fetchText(targetUrl);
        } catch (e) {
          errors.push({
            sourceId: source.id,
            phase: 'connect',
            message: e instanceof Error ? e.message : String(e),
            url: targetUrl,
          });
          break;
        }
        if (page.status !== 200) {
          errors.push({
            sourceId: source.id,
            phase: 'connect',
            message: `HTTP ${page.status} from ${targetUrl}`,
            url: targetUrl,
          });
          break;
        }
        try {
          const got = await extract(page.text, page.url, maxJobs - extracted.length);
          const fresh = got.filter((j) => !seenUrls.has(j.url));
          for (const j of fresh) seenUrls.add(j.url);
          extracted.push(...fresh);
          if (!got.length || !fresh.length) break; // fim da listagem
        } catch (e) {
          errors.push({
            sourceId: source.id,
            phase: 'parse',
            message: `LLM extraction failed: ${e instanceof Error ? e.message : String(e)}`,
            url: targetUrl,
          });
          break;
        }
      }
    }

    const jobs = extracted
      .filter(
        (j) =>
          // O LLM pode devolver link de busca em vez de página de vaga.
          isJobListingUrl(j.url) && matchesTargetTitles(j.title, config.discovery.targetTitles),
      )
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
        sourcesTried: templates.length,
        sourcesSucceeded: extracted.length > 0 ? 1 : 0,
        totalRaw: extracted.length,
        afterDedup: jobs.length,
        afterFilters: jobs.length,
        durationMs: Date.now() - start,
      },
    };
  },
};
