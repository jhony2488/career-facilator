import { apiAdapter } from '../../../src/discovery/adapters/apiAdapter';
import { sourceById } from '../../../src/discovery/registry';
import { makeConfig } from '../../helpers/factories';
import type { Fetcher } from '../../../src/discovery/types';

const jsonFetcher = (data: unknown, status = 200): Fetcher => ({
  fetchText: jest.fn(async () => ({
    url: 'https://remoteok.com/api',
    text: JSON.stringify(data),
    status,
  })),
  fetchJson: (async <T = unknown>() => ({
    url: 'https://remoteok.com/api',
    data: data as T,
    status,
  })) as Fetcher['fetchJson'],
});

const failingFetcher = (status: number): Fetcher => ({
  fetchText: jest.fn(async () => ({ url: 'https://remoteok.com/api', text: 'error', status })),
  fetchJson: (async <T = unknown>() => ({
    url: 'https://remoteok.com/api',
    data: null as T,
    status,
  })) as Fetcher['fetchJson'],
});

describe('apiAdapter', () => {
  // feature/01: "Coletar vagas diretamente de portais ATS cadastrados"
  it('normalizes RemoteOK API jobs into raw job inputs', async () => {
    const source = sourceById('remoteok')!;
    const config = makeConfig();
    config.discovery.targetTitles = ['Backend Developer'];
    const result = await apiAdapter.discover({
      config,
      source,
      fetcher: jsonFetcher([
        { legal: 'Remote OK legal notice' },
        {
          position: 'Senior Backend Developer',
          url: 'https://remoteok.com/remote-jobs/1',
          company: 'Acme',
          location: 'Remote',
          description: '<p>Backend work</p>',
          salary_min: 1000,
          salary_max: 2000,
          date: '2025-01-01T00:00:00Z',
        },
      ]),
      maxJobs: 10,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].raw.url).toBe('https://remoteok.com/remote-jobs/1');
    expect(result.jobs[0].raw.html).toContain('Senior Backend Developer');
    expect(result.jobs[0].raw.html).toContain('Acme');
    expect(result.jobs[0].sourceId).toBe('remoteok');
  });

  // feature/01: vagas de thread HN vêm como comentários com contato no corpo
  it('collects HN "Who is hiring" comments as jobs with permalink URLs', async () => {
    const source = sourceById('hnhiring')!;
    const config = makeConfig();
    config.discovery.targetTitles = ['Backend Developer'];
    const fetcher: Fetcher = {
      fetchText: jest.fn(async () => ({ url: '', text: '', status: 200 })),
      fetchJson: (async <T = unknown>(url: string) => ({
        url,
        data: (url.includes('/search?')
          ? { hits: [{ objectID: '424242', title: 'Ask HN: Who is hiring? (December 2025)' }] }
          : {
              children: [
                {
                  id: 777,
                  text: 'Acme Corp | Senior Backend Developer | Remote | jobs@acme.com<p>We build APIs.</p>',
                },
                { id: 778, text: 'Just a marketing blurb, no role here.' },
              ],
            }) as T,
        status: 200,
      })) as Fetcher['fetchJson'],
    };

    const result = await apiAdapter.discover({ config, source, fetcher, maxJobs: 10 });

    expect(result.errors).toHaveLength(0);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].raw.url).toBe('https://news.ycombinator.com/item?id=777');
    expect(result.jobs[0].raw.html).toContain('jobs@acme.com');
    expect(result.jobs[0].raw.html).toContain('Backend Developer');
  });

  // feature/01: jobstories oficiais — it.url é o link externo de candidatura
  it('collects HN Firebase job stories with external apply URLs', async () => {
    const source = sourceById('hnjobs')!;
    const config = makeConfig();
    config.discovery.targetTitles = ['Backend Developer'];
    const items: Record<string, Record<string, unknown>> = {
      '101': {
        type: 'job',
        title: 'Acme (YC S20) is hiring backend developers',
        url: 'https://jobs.acme.com/apply/backend',
        text: 'Email hiring@acme.com',
        time: 1733000000,
      },
      '102': { type: 'job', title: 'Office cats wanted', time: 1733000001 },
      '103': { type: 'story', title: 'Not a job', time: 1733000002 },
    };
    const fetcher: Fetcher = {
      fetchText: jest.fn(async () => ({ url: '', text: '', status: 200 })),
      fetchJson: (async <T = unknown>(url: string) => ({
        url,
        data: (url.includes('jobstories')
          ? [101, 102, 103]
          : items[new URL(url).pathname.split('/').pop()!.replace('.json', '')]) as T,
        status: 200,
      })) as Fetcher['fetchJson'],
    };

    const result = await apiAdapter.discover({ config, source, fetcher, maxJobs: 10 });

    expect(result.errors).toHaveLength(0);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].raw.url).toBe('https://jobs.acme.com/apply/backend');
    expect(result.jobs[0].raw.html).toContain('hiring@acme.com');
  });

  // feature/01: busca derivada da config — count + geo de DISCOVERY_REGIONS
  it('maps DISCOVERY_REGIONS to the jobicy geo param', async () => {
    const source = sourceById('jobicy')!;
    const config = makeConfig();
    config.discovery.regions = ['BR'];
    const urls: string[] = [];
    const fetcher: Fetcher = {
      fetchText: jest.fn(async () => ({ url: '', text: '', status: 200 })),
      fetchJson: (async <T = unknown>(url: string) => {
        urls.push(url);
        return { url, data: { jobs: [] } as T, status: 200 };
      }) as Fetcher['fetchJson'],
    };

    await apiAdapter.discover({ config, source, fetcher, maxJobs: 30 });

    expect(urls[0]).toContain('geo=brazil');
    expect(urls[0]).toContain('count=30');
  });

  it('omits the jobicy geo param when no region maps', async () => {
    const source = sourceById('jobicy')!;
    const config = makeConfig();
    config.discovery.regions = [];
    const urls: string[] = [];
    const fetcher: Fetcher = {
      fetchText: jest.fn(async () => ({ url: '', text: '', status: 200 })),
      fetchJson: (async <T = unknown>(url: string) => {
        urls.push(url);
        return { url, data: { jobs: [] } as T, status: 200 };
      }) as Fetcher['fetchJson'],
    };

    await apiAdapter.discover({ config, source, fetcher, maxJobs: 10 });

    expect(urls[0]).not.toContain('geo=');
  });

  // feature/01: arbeitnow é JSON paginado — varre até encher o limite
  it('pages through arbeitnow until maxJobs is reached', async () => {
    const source = sourceById('arbeitnow')!;
    const config = makeConfig();
    config.discovery.targetTitles = ['Backend Developer'];
    const urls: string[] = [];
    const mk = (slug: string) => ({
      title: 'Backend Developer',
      url: `https://example.com/jobs/${slug}`,
      company_name: 'Acme',
      description: '<p>API work</p>',
    });
    const pages: Record<string, unknown[]> = {
      '1': [mk('a'), mk('b')],
      '2': [mk('c')],
      '3': [],
    };
    const fetcher: Fetcher = {
      fetchText: jest.fn(async () => ({ url: '', text: '', status: 200 })),
      fetchJson: (async <T = unknown>(url: string) => {
        urls.push(url);
        const page = new URL(url).searchParams.get('page') ?? '1';
        return { url, data: { data: pages[page] ?? [] } as T, status: 200 };
      }) as Fetcher['fetchJson'],
    };

    const result = await apiAdapter.discover({ config, source, fetcher, maxJobs: 10 });

    expect(urls).toHaveLength(3);
    expect(result.jobs).toHaveLength(3);
  });

  // feature/01: remoteok apply_url é o link real de candidatura
  it('prefers RemoteOK apply_url over the listing url', async () => {
    const source = sourceById('remoteok')!;
    const config = makeConfig();
    config.discovery.targetTitles = ['Backend Developer'];
    const result = await apiAdapter.discover({
      config,
      source,
      fetcher: jsonFetcher([
        {
          position: 'Backend Developer',
          url: 'https://remoteok.com/remote-jobs/1',
          apply_url: 'https://boards.greenhouse.io/acme/jobs/42',
          company: 'Acme',
        },
      ]),
      maxJobs: 10,
    });

    expect(result.jobs[0].raw.url).toBe('https://boards.greenhouse.io/acme/jobs/42');
  });

  // feature/01: issues abertas de repos GitHub de vagas BR são as vagas
  it('collects GitHub repo issues as jobs, skipping PRs and mapping labels', async () => {
    const source = sourceById('ghbackendbr')!;
    const config = makeConfig();
    config.discovery.targetTitles = ['Backend Developer'];
    const result = await apiAdapter.discover({
      config,
      source,
      fetcher: jsonFetcher([
        {
          title: 'Backend Developer @ Acme',
          html_url: 'https://github.com/backend-br/vagas/issues/42',
          body: 'Envie CV para jobs@acme.com\nRemoto.',
          labels: [{ name: 'Remoto' }, { name: 'PJ' }, { name: 'Sênior' }],
          created_at: '2025-12-01T00:00:00Z',
          user: { login: 'acme' },
        },
        {
          title: 'Fix flaky test',
          html_url: 'https://github.com/backend-br/vagas/pull/99',
          pull_request: {},
        },
        { title: 'Barista senior', html_url: 'https://github.com/backend-br/vagas/issues/43' },
      ]),
      maxJobs: 10,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].raw.url).toBe('https://github.com/backend-br/vagas/issues/42');
    expect(result.jobs[0].raw.html).toContain('jobs@acme.com');
    expect(result.jobs[0].raw.html).toContain('Sênior');
  });

  // feature/01: "Fonte temporariamente indisponível não interrompe o ciclo"
  it('returns a controlled error when the source responds with a non-200 status', async () => {
    const source = sourceById('remoteok')!;
    const result = await apiAdapter.discover({
      config: makeConfig(),
      source,
      fetcher: failingFetcher(503),
      maxJobs: 10,
    });

    expect(result.jobs).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].phase).toBe('parse');
    expect(result.errors[0].message).toContain('503');
  });
});
