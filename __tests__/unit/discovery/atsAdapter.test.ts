import { atsAdapter } from '../../../src/discovery/adapters/atsAdapter';
import { sourceById } from '../../../src/discovery/registry';
import { makeConfig } from '../../helpers/factories';
import type { Fetcher } from '../../../src/discovery/types';

const fetcherFor = (data: unknown, status = 200): Fetcher => ({
  fetchText: jest.fn(async () => ({ url: '', text: '', status })),
  fetchJson: (async <T = unknown>() => ({
    url: '',
    data: data as T,
    status,
  })) as Fetcher['fetchJson'],
});

describe('atsAdapter', () => {
  // feature/01: "Coletar vagas diretamente de portais ATS cadastrados"
  it('fetches greenhouse board jobs for configured company slugs', async () => {
    const config = makeConfig();
    config.discovery.targetTitles = ['Backend Developer'];
    config.discovery.atsBoards = { greenhouse: ['acme'] };
    const result = await atsAdapter.discover({
      config,
      source: sourceById('greenhouse')!,
      fetcher: fetcherFor({
        jobs: [
          {
            title: 'Backend Developer',
            absolute_url: 'https://boards.greenhouse.io/acme/jobs/42',
            content: '<p>API work</p>',
            company_name: 'Acme',
            location: { name: 'São Paulo' },
            updated_at: '2026-01-10T00:00:00Z',
          },
          { title: 'Barista senior', absolute_url: 'https://boards.greenhouse.io/acme/jobs/43' },
        ],
      }),
      maxJobs: 10,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].raw.url).toBe('https://boards.greenhouse.io/acme/jobs/42');
    expect(result.jobs[0].raw.html).toContain('Backend Developer');
    expect(result.jobs[0].raw.html).toContain('Acme');
  });

  it('fetches lever board postings and uses the slug as company', async () => {
    const config = makeConfig();
    config.discovery.targetTitles = ['Backend Developer'];
    config.discovery.atsBoards = { lever: ['stripe'] };
    const result = await atsAdapter.discover({
      config,
      source: sourceById('lever')!,
      fetcher: fetcherFor([
        {
          text: 'Backend Developer',
          hostedUrl: 'https://jobs.lever.co/stripe/abc',
          descriptionPlain: 'APIs at scale',
          categories: { location: 'Remote', commitment: 'Full-time' },
          createdAt: 1736000000000,
        },
      ]),
      maxJobs: 10,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].raw.url).toBe('https://jobs.lever.co/stripe/abc');
    expect(result.jobs[0].raw.html).toContain('stripe');
    expect(result.jobs[0].raw.html).toContain('Remote');
  });

  it('iterates every configured slug and keeps going when one board 404s', async () => {
    const config = makeConfig();
    config.discovery.targetTitles = ['Backend Developer'];
    config.discovery.atsBoards = { greenhouse: ['dead', 'acme'] };
    const fetcher: Fetcher = {
      fetchText: jest.fn(async () => ({ url: '', text: '', status: 200 })),
      fetchJson: (async <T = unknown>(url: string) => ({
        url,
        data: (url.includes('/dead/')
          ? null
          : {
              jobs: [
                {
                  title: 'Backend Developer',
                  absolute_url: 'https://boards.greenhouse.io/acme/jobs/1',
                },
              ],
            }) as T,
        status: url.includes('/dead/') ? 404 : 200,
      })) as Fetcher['fetchJson'],
    };

    const result = await atsAdapter.discover({
      config,
      source: sourceById('greenhouse')!,
      fetcher,
      maxJobs: 10,
    });

    expect(result.jobs).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('dead');
  });

  it('reports an actionable error when no slugs are configured', async () => {
    const result = await atsAdapter.discover({
      config: makeConfig(),
      source: sourceById('greenhouse')!,
      fetcher: fetcherFor({}),
      maxJobs: 10,
    });

    expect(result.jobs).toHaveLength(0);
    expect(result.errors[0].message).toContain('DISCOVERY_ATS_BOARDS');
  });

  it('keeps an informative error for ATS providers not yet supported', async () => {
    const result = await atsAdapter.discover({
      config: makeConfig(),
      source: sourceById('workday')!,
      fetcher: fetcherFor({}),
      maxJobs: 10,
    });

    expect(result.jobs).toHaveLength(0);
    expect(result.errors[0].message).toContain('Greenhouse e Lever');
  });
});
