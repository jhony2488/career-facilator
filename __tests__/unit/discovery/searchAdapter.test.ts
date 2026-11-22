import { searchAdapter } from '../../../src/discovery/adapters/searchAdapter';
import { makeConfig } from '../../helpers/factories';
import type { Fetcher, JobSource } from '../../../src/discovery/types';

const DDG_HTML = `<html><body>
<div class="result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Facme.example%2Fjob%2F1&rut=abc">Senior Backend Developer — Acme</a>
  <a class="result__snippet">Remote backend role, TypeScript stack</a>
</div>
<div class="result">
  <a class="result__a" href="https://jobs.example/2">Barista Wanted</a>
  <a class="result__snippet">Coffee shop position</a>
</div>
<div class="result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.linkedin.com%2Fposts%2Fsomeone-123&rut=def">Fulano no LinkedIn: contratando dev remoto</a>
  <a class="result__snippet">Estamos contratando — envie CV para dev@acme.example</a>
</div>
</body></html>`;

// Bing wraps real URLs in /ck/a?u=a1<base64url> — first link decodes to acme.example/bing/1
const BING_HTML = `<html><body>
<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?p=e07e39&u=a1aHR0cHM6Ly9hY21lLmV4YW1wbGUvYmluZy8x&ntb=1">Backend Developer at BingCo</a></h2>
<div class="b_caption"><p>Remote position, apply now</p></div></li>
<li class="b_algo"><h2><a href="https://acme.example/bing/2">Head Chef</a></h2></li>
</body></html>`;

function serpFetcher(
  map: Record<string, { text: string; status?: number }>,
): Fetcher & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fetchText: jest.fn(async (url: string) => {
      calls.push(url);
      for (const [match, res] of Object.entries(map)) {
        if (url.includes(match)) {
          return { url, text: res.text, status: res.status ?? 200 };
        }
      }
      return { url, text: '<html></html>', status: 404 };
    }),
    fetchJson: (async <T = unknown>() => ({
      url: '',
      data: null as T,
      status: 404,
    })) as Fetcher['fetchJson'],
  };
}

function makeSearchSource(overrides: Partial<JobSource> = {}): JobSource {
  return {
    id: 'searchdork',
    name: 'Dork / busca orgânica',
    category: 'search',
    regions: ['GLOBAL'],
    adapter: 'search',
    enabled: false,
    risky: false,
    requiresAuth: false,
    robotsPolicy: 'allow',
    ...overrides,
  };
}

describe('searchAdapter', () => {
  it('returns a controlled error when DISCOVERY_SEARCH_ENGINE is none', async () => {
    const config = makeConfig();
    const result = await searchAdapter.discover({
      config,
      source: makeSearchSource(),
      fetcher: serpFetcher({}),
      maxJobs: 10,
    });

    expect(result.jobs).toHaveLength(0);
    expect(result.errors[0].message).toContain('DISCOVERY_SEARCH_ENGINE');
  });

  it('parses DuckDuckGo results, resolves uddg redirects and filters by title', async () => {
    const config = makeConfig();
    config.discovery.searchEngine = 'duckduckgo';
    config.discovery.targetTitles = ['Backend Developer'];
    const source = makeSearchSource({
      adapterConfig: { dorkTemplates: ['{query} remote'] },
    });
    const fetcher = serpFetcher({ 'html.duckduckgo.com': { text: DDG_HTML } });

    const result = await searchAdapter.discover({
      config,
      source,
      fetcher,
      maxJobs: 10,
    });

    expect(fetcher.calls).toHaveLength(1);
    expect(fetcher.calls[0]).toContain('html.duckduckgo.com');
    expect(fetcher.calls[0]).toContain('%22Backend%20Developer%22');
    expect(result.errors).toHaveLength(0);
    const urls = result.jobs.map((j) => j.raw.url);
    expect(urls).toEqual(['https://acme.example/job/1']);
    // 'Barista Wanted' and the post-style LinkedIn title are dropped by the title filter
    expect(result.jobs[0].raw.html).toContain('Senior Backend Developer');
  });

  it('keeps post-style titles when adapterConfig.titleFilter is false', async () => {
    const config = makeConfig();
    config.discovery.searchEngine = 'duckduckgo';
    config.discovery.targetTitles = ['Backend Developer'];
    const source = makeSearchSource({
      adapterConfig: {
        dorkTemplates: ['{query} hiring remote'],
        titleFilter: false,
      },
    });
    const result = await searchAdapter.discover({
      config,
      source,
      fetcher: serpFetcher({ 'html.duckduckgo.com': { text: DDG_HTML } }),
      maxJobs: 10,
    });

    const urls = result.jobs.map((j) => j.raw.url);
    expect(urls).toContain('https://acme.example/job/1');
    expect(urls).toContain('https://jobs.example/2');
    expect(urls).toContain('https://www.linkedin.com/posts/someone-123');
  });

  it('enforces the site: operator domain even when the engine broadens results', async () => {
    const config = makeConfig();
    config.discovery.searchEngine = 'duckduckgo';
    const source = makeSearchSource({
      adapterConfig: {
        dorkTemplates: ['site:linkedin.com/posts {query}'],
        titleFilter: false,
      },
    });
    const fetcher = serpFetcher({ 'html.duckduckgo.com': { text: DDG_HTML } });

    const result = await searchAdapter.discover({
      config,
      source,
      fetcher,
      maxJobs: 10,
    });

    expect(fetcher.calls[0]).toContain('site%3Alinkedin.com%2Fposts');
    expect(result.jobs.map((j) => j.raw.url)).toEqual([
      'https://www.linkedin.com/posts/someone-123',
    ]);
  });

  it('parses Bing results when engine is bing', async () => {
    const config = makeConfig();
    config.discovery.searchEngine = 'bing';
    config.discovery.targetTitles = ['Backend Developer'];
    const result = await searchAdapter.discover({
      config,
      source: makeSearchSource({ adapterConfig: { dorkTemplates: ['{query}'] } }),
      fetcher: serpFetcher({ 'bing.com': { text: BING_HTML } }),
      maxJobs: 10,
    });

    expect(result.jobs.map((j) => j.raw.url)).toEqual(['https://acme.example/bing/1']);
  });

  it('isolates a failed query and keeps results from the next one', async () => {
    const config = makeConfig();
    config.discovery.searchEngine = 'duckduckgo';
    config.discovery.targetTitles = ['Backend Developer'];
    const source = makeSearchSource({
      adapterConfig: { dorkTemplates: ['first {query}', 'second {query}'] },
    });
    const fetcher = serpFetcher({
      first: { text: 'blocked', status: 500 },
      second: { text: DDG_HTML },
    });

    const result = await searchAdapter.discover({
      config,
      source,
      fetcher,
      maxJobs: 10,
    });

    // engine fallback: 500 on DDG + 404 on Bing both recorded for the first query
    expect(result.errors).toHaveLength(2);
    expect(result.errors.every((e) => e.phase === 'connect')).toBe(true);
    expect(result.jobs.length).toBeGreaterThan(0);
  });

  it('falls back to buildSearchQueries when no dorkTemplate is configured', async () => {
    const config = makeConfig();
    config.discovery.searchEngine = 'duckduckgo';
    const fetcher = serpFetcher({ 'html.duckduckgo.com': { text: DDG_HTML } });

    const result = await searchAdapter.discover({
      config,
      source: makeSearchSource(),
      fetcher,
      maxJobs: 10,
    });

    // BOTH scope in factories yields national + international queries
    expect(fetcher.calls.length).toBeGreaterThan(3);
    expect(fetcher.calls.some((u) => u.includes('site%3Aboards.greenhouse.io'))).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('drops LinkedIn search/listing URLs but keeps job view and post URLs', async () => {
    const config = makeConfig();
    config.discovery.searchEngine = 'duckduckgo';
    const html = `<html><body>
    <div class="result"><a class="result__a" href="https://br.linkedin.com/jobs/desenvolvedor-vagas">Vagas dev</a><a class="result__snippet">listagem</a></div>
    <div class="result"><a class="result__a" href="https://www.linkedin.com/jobs/view/backend-dev-123456789">Backend Dev</a><a class="result__snippet">vaga individual</a></div>
    <div class="result"><a class="result__a" href="https://www.linkedin.com/search/results/content/?keywords=dev">Busca LinkedIn</a><a class="result__snippet">busca</a></div>
    </body></html>`;

    const result = await searchAdapter.discover({
      config,
      source: makeSearchSource({
        adapterConfig: { dorkTemplates: ['{query}'], titleFilter: false },
      }),
      fetcher: serpFetcher({ 'html.duckduckgo.com': { text: html } }),
      maxJobs: 10,
    });

    expect(result.jobs.map((j) => j.raw.url)).toEqual([
      'https://www.linkedin.com/jobs/view/backend-dev-123456789',
    ]);
  });

  it('caps collected hits at maxJobs', async () => {
    const config = makeConfig();
    config.discovery.searchEngine = 'duckduckgo';
    config.discovery.targetTitles = ['Backend Developer'];
    const result = await searchAdapter.discover({
      config,
      source: makeSearchSource({
        adapterConfig: { dorkTemplates: ['{query}'], titleFilter: false },
      }),
      fetcher: serpFetcher({ 'html.duckduckgo.com': { text: DDG_HTML } }),
      maxJobs: 1,
    });

    expect(result.jobs).toHaveLength(1);
  });
});
