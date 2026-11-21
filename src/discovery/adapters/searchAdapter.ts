import { parse } from 'node-html-parser';
import { buildSearchQueries } from '../../geo/dorkBuilder';
import { rawJobFromNormalized, matchesTargetTitles } from '../normalizer';
import type {
  SourceAdapter,
  SourceAdapterContext,
  DiscoveryResult,
  DiscoveryError,
} from '../types';

interface SerpHit {
  url: string;
  title?: string;
  snippet?: string;
}

/** adapterConfig reconhecido pelo adapter `search`. */
export interface SearchSourceConfig {
  /** Dorks completas; {query} vira os termos de título. */
  dorkTemplates?: string[];
  /** Sinônimo de dorkTemplates com uma string. */
  dorkTemplate?: string;
  /** false = não filtra por targetTitles (posts do LinkedIn). */
  titleFilter?: boolean;
}

const ENGINE_URLS: Record<'duckduckgo' | 'bing', (q: string) => string> = {
  duckduckgo: (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
  bing: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}&count=20`,
};

function fail(
  ctx: SourceAdapterContext,
  phase: DiscoveryError['phase'],
  message: string,
  start: number,
): DiscoveryResult {
  return {
    jobs: [],
    errors: [{ sourceId: ctx.source.id, phase, message }],
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

/** Termos de título usados no placeholder {query} dos dork templates. */
function titleTerms(titles: string[]): string {
  const picked = titles.filter((t) => t.trim()).slice(0, 3);
  if (!picked.length) return 'developer remote';
  return `(${picked.map((t) => `"${t.trim()}"`).join(' OR ')})`;
}

/** Dorks da fonte via adapterConfig; vazio → caller usa buildSearchQueries (plano por escopo). */
function sourceQueries(cfg: SearchSourceConfig, titles: string[]): string[] {
  const templates = cfg.dorkTemplates ?? (cfg.dorkTemplate ? [cfg.dorkTemplate] : []);
  const terms = titleTerms(titles);
  return templates.map((t) => t.replaceAll('{query}', terms));
}

function resolveDuckDuckGoUrl(href: string): string | null {
  if (!href) return null;
  // DDG redireciona via //duckduckgo.com/l/?uddg=<enc>
  if (href.includes('uddg=')) {
    try {
      const u = new URL(href.startsWith('http') ? href : `https:${href}`);
      const real = u.searchParams.get('uddg');
      return real ? decodeURIComponent(real) : null;
    } catch {
      return null;
    }
  }
  if (href.startsWith('//')) return `https:${href}`;
  return href.startsWith('http') ? href : null;
}

function parseDuckDuckGo(html: string, limit: number): SerpHit[] {
  const root = parse(html);
  const hits: SerpHit[] = [];
  for (const a of root.querySelectorAll('a.result__a')) {
    if (hits.length >= limit) break;
    const url = resolveDuckDuckGoUrl(a.getAttribute('href') ?? '');
    if (!url) continue;
    const resultEl = a.closest('.result');
    const snippet =
      resultEl?.querySelector('a.result__snippet, .result__snippet')?.text.trim() ?? undefined;
    hits.push({ url, title: a.text.trim() || undefined, snippet });
  }
  return hits;
}

/** Bing envelopa o destino em /ck/a?...&u=a1<base64url> — decodifica a URL real. */
function resolveBingUrl(href: string): string | null {
  if (!href.startsWith('http')) return null;
  try {
    const u = new URL(href);
    if (u.hostname.endsWith('bing.com') && u.pathname.startsWith('/ck/a')) {
      const enc = u.searchParams.get('u');
      if (enc?.startsWith('a1')) {
        const b64 = enc.slice(2).replace(/-/g, '+').replace(/_/g, '/');
        const real = Buffer.from(b64, 'base64').toString('utf8');
        return real.startsWith('http') ? real : null;
      }
      return null;
    }
    return href;
  } catch {
    return null;
  }
}

function parseBing(html: string, limit: number): SerpHit[] {
  const root = parse(html);
  const hits: SerpHit[] = [];
  for (const li of root.querySelectorAll('li.b_algo')) {
    if (hits.length >= limit) break;
    const a = li.querySelector('h2 a');
    const url = resolveBingUrl(a?.getAttribute('href') ?? '');
    if (!url) continue;
    const snippet = li.querySelector('.b_caption p, .b_algoSlug')?.text.trim() ?? undefined;
    hits.push({ url, title: a!.text.trim() || undefined, snippet });
  }
  return hits;
}

function serpQueryUrl(engine: 'duckduckgo' | 'bing', query: string): string {
  return ENGINE_URLS[engine](query);
}

/** Extrai `site:dominio` da query — engines podem alargar a busca; o filtro garante. */
function siteFilterFrom(query: string): string | null {
  const m = /site:([^\s()/]+)/i.exec(query);
  return m ? m[1]!.toLowerCase() : null;
}

function matchesSite(url: string, site: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === site || h.endsWith(`.${site}`);
  } catch {
    return false;
  }
}

export const searchAdapter: SourceAdapter = {
  name: 'search',
  async discover(ctx: SourceAdapterContext): Promise<DiscoveryResult> {
    const start = Date.now();
    const { source, config, fetcher, maxJobs } = ctx;
    const engine = config.discovery.searchEngine;

    if (engine === 'none') {
      return fail(
        ctx,
        'unknown',
        `Organic search for ${source.name} requires DISCOVERY_SEARCH_ENGINE=duckduckgo|bing`,
        start,
      );
    }

    const cfg = (source.adapterConfig ?? {}) as SearchSourceConfig;
    let queries = sourceQueries(cfg, config.discovery.targetTitles);
    if (!queries.length) {
      queries = buildSearchQueries(config).map((q) => q.query);
    }
    if (!queries.length) {
      return fail(ctx, 'unknown', `No search queries available for ${source.id}`, start);
    }

    const limitPerQuery = config.discovery.searchResultLimit;
    const titleFilter = cfg.titleFilter !== false;
    const errors: DiscoveryError[] = [];
    const hits: SerpHit[] = [];
    const seen = new Set<string>();
    // Engine configurado primeiro; o outro serve de fallback por query (DDG 202, etc.).
    const engines =
      engine === 'bing' ? (['bing', 'duckduckgo'] as const) : (['duckduckgo', 'bing'] as const);

    for (const query of queries) {
      if (hits.length >= maxJobs) break;
      if (ctx.signal?.aborted) break;

      let parsed: SerpHit[] | null = null;
      for (const eng of engines) {
        const url = serpQueryUrl(eng, query);
        let page;
        try {
          page = await fetcher.fetchText(url);
        } catch (e) {
          errors.push({
            sourceId: source.id,
            phase: 'connect',
            message: e instanceof Error ? e.message : String(e),
            url,
          });
          continue;
        }
        if (page.status !== 200) {
          errors.push({
            sourceId: source.id,
            phase: 'connect',
            message: `HTTP ${page.status} from ${url}`,
            url,
          });
          continue;
        }
        parsed =
          eng === 'bing'
            ? parseBing(page.text, limitPerQuery)
            : parseDuckDuckGo(page.text, limitPerQuery);
        break;
      }
      if (!parsed) continue;
      const site = siteFilterFrom(query);
      for (const hit of parsed) {
        if (hits.length >= maxJobs) break;
        if (site && !matchesSite(hit.url, site)) continue;
        let key: string;
        try {
          const u = new URL(hit.url);
          key = `${u.hostname}${u.pathname}`;
        } catch {
          key = hit.url;
        }
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push(hit);
      }
    }

    const jobs = hits
      .filter(
        (h) =>
          !titleFilter || !h.title || matchesTargetTitles(h.title, config.discovery.targetTitles),
      )
      .map((h) =>
        rawJobFromNormalized(
          { url: h.url, title: h.title, descriptionMarkdown: h.snippet },
          source.name,
          source.id,
        ),
      );

    return {
      jobs,
      errors,
      meta: {
        sourcesTried: 1,
        sourcesSucceeded: jobs.length > 0 ? 1 : 0,
        totalRaw: hits.length,
        afterDedup: hits.length,
        afterFilters: jobs.length,
        durationMs: Date.now() - start,
      },
    };
  },
};
