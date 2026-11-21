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
        data: (
          url.includes('/search?')
            ? { hits: [{ objectID: '424242', title: 'Ask HN: Who is hiring? (December 2025)' }] }
            : {
                children: [
                  {
                    id: 777,
                    text: 'Acme Corp | Senior Backend Developer | Remote | jobs@acme.com<p>We build APIs.</p>',
                  },
                  { id: 778, text: 'Just a marketing blurb, no role here.' },
                ],
              }
        ) as T,
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
