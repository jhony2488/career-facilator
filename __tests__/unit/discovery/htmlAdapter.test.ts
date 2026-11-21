import { htmlAdapter } from '../../../src/discovery/adapters/htmlAdapter';
import { makeConfig } from '../../helpers/factories';
import type { Fetcher, GenericExtractor, JobSource } from '../../../src/discovery/types';

const htmlFetcher = (html: string, status = 200): Fetcher => ({
  fetchText: jest.fn(async (url: string) => ({ url, text: html, status })),
  fetchJson: (async <T = unknown>() => ({
    url: '',
    data: null as T,
    status,
  })) as Fetcher['fetchJson'],
});

function makeHtmlSource(overrides: Partial<JobSource> = {}): JobSource {
  return {
    id: 'justremote',
    name: 'JustRemote',
    category: 'global-api',
    regions: ['GLOBAL'],
    adapter: 'html',
    enabled: false,
    risky: false,
    requiresAuth: false,
    url: 'https://justremote.co/remote-developer-jobs',
    robotsPolicy: 'allow',
    ...overrides,
  };
}

const fakeExtract =
  (jobs: Awaited<ReturnType<GenericExtractor>>): GenericExtractor =>
  async () =>
    jobs;

describe('htmlAdapter', () => {
  it('extracts jobs via the generic LLM extractor when the fallback is enabled', async () => {
    const config = makeConfig();
    config.discovery.targetTitles = ['Backend Developer'];
    const result = await htmlAdapter.discover({
      config,
      source: makeHtmlSource(),
      fetcher: htmlFetcher('<html><body>list</body></html>'),
      extract: fakeExtract([
        {
          title: 'Senior Backend Developer',
          url: 'https://justremote.co/job/1',
          company: 'Acme',
        },
        { title: 'Barista', url: 'https://justremote.co/job/2' },
      ]),
      maxJobs: 10,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].raw.url).toBe('https://justremote.co/job/1');
    expect(result.jobs[0].raw.html).toContain('Senior Backend Developer');
  });

  it('returns a controlled error when the fallback is disabled', async () => {
    const result = await htmlAdapter.discover({
      config: makeConfig(),
      source: makeHtmlSource(),
      fetcher: htmlFetcher('<html></html>'),
      maxJobs: 10,
    });

    expect(result.jobs).toHaveLength(0);
    expect(result.errors[0].message).toContain('DISCOVERY_USE_GENERIC_FALLBACK');
  });

  it('fans out to one listing page per target title when the template has {query}', async () => {
    const fetchedUrls: string[] = [];
    const fetcher: Fetcher = {
      fetchText: jest.fn(async (url: string) => {
        fetchedUrls.push(url);
        return { url, text: '<html></html>', status: 200 };
      }),
      fetchJson: (async <T = unknown>() => ({
        url: '',
        data: null as T,
        status: 200,
      })) as Fetcher['fetchJson'],
    };
    const extract: GenericExtractor = async (_html, pageUrl) =>
      pageUrl.includes('Backend')
        ? [{ title: 'Senior Backend Developer', url: 'https://x/job/1' }]
        : [{ title: 'Senior Frontend Developer', url: 'https://x/job/2' }];

    const config = makeConfig();
    config.discovery.targetTitles = ['Backend Developer', 'Frontend Developer'];
    const result = await htmlAdapter.discover({
      config,
      source: makeHtmlSource({
        url: undefined,
        searchUrlTemplate: 'https://x/jobs?q={query}',
      }),
      fetcher,
      extract,
      maxJobs: 10,
    });

    expect(fetchedUrls).toHaveLength(2);
    expect(fetchedUrls[0]).toContain('Backend');
    expect(result.jobs).toHaveLength(2);
  });

  it('fetches a single page when the template has no {query}', async () => {
    const fetchedUrls: string[] = [];
    const fetcher: Fetcher = {
      fetchText: jest.fn(async (url: string) => {
        fetchedUrls.push(url);
        return { url, text: '<html></html>', status: 200 };
      }),
      fetchJson: (async <T = unknown>() => ({
        url: '',
        data: null as T,
        status: 200,
      })) as Fetcher['fetchJson'],
    };
    const extract: GenericExtractor = async () => [];

    const config = makeConfig();
    config.discovery.targetTitles = ['A', 'B'];
    const result = await htmlAdapter.discover({
      config,
      source: makeHtmlSource({
        url: undefined,
        searchUrlTemplate: 'https://x/jobs?page={page}',
      }),
      fetcher,
      extract,
      maxJobs: 10,
    });

    expect(fetchedUrls).toEqual(['https://x/jobs?page=1']);
    expect(result.errors).toHaveLength(0);
  });

  it('returns a controlled error when the source has no listing URL', async () => {
    const config = makeConfig();
    const result = await htmlAdapter.discover({
      config,
      source: makeHtmlSource({ url: undefined }),
      fetcher: htmlFetcher('<html></html>'),
      extract: fakeExtract([]),
      maxJobs: 10,
    });

    expect(result.jobs).toHaveLength(0);
    expect(result.errors[0].message).toContain('no listing URL');
  });
});
