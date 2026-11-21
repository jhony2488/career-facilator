import { discoverJobs, toRawJobInputs } from '../../../src/discovery/discoveryEngine';
import { makeConfig } from '../../helpers/factories';
import type {
  DiscoveryJob,
  DiscoveryResult,
  SourceAdapterContext,
} from '../../../src/discovery/types';

let adapterResult: DiscoveryResult;
let lastCtx: SourceAdapterContext | undefined;

jest.mock('../../../src/discovery/adapters', () => ({
  getAdapter: () => ({
    name: 'api',
    discover: async (ctx: SourceAdapterContext) => {
      lastCtx = ctx;
      return adapterResult;
    },
  }),
}));

function makeDiscoveryJob(url: string, sourceId = 'remoteok'): DiscoveryJob {
  return {
    raw: { url, html: `<html><body>${url}</body></html>` },
    sourceId,
    sourceName: 'RemoteOK',
    discoveredAt: '2025-01-01T00:00:00Z',
  };
}

describe('discoverJobs', () => {
  beforeEach(() => {
    adapterResult = {
      jobs: [
        makeDiscoveryJob('https://remoteok.com/remote-jobs/1'),
        makeDiscoveryJob('https://remoteok.com/remote-jobs/1?utm_source=x'),
        makeDiscoveryJob('https://remoteok.com/remote-jobs/2'),
      ],
      errors: [],
      meta: {
        sourcesTried: 1,
        sourcesSucceeded: 1,
        totalRaw: 3,
        afterDedup: 2,
        afterFilters: 2,
        durationMs: 1,
      },
    };
  });

  // feature/01: "Vagas coletadas seguem imediatamente para deduplicação"
  it('deduplicates jobs by canonical URL before returning', async () => {
    const config = makeConfig();
    config.discovery.sources = ['remoteok'];
    const result = await discoverJobs({ config, maxJobs: 10 });
    expect(result.jobs).toHaveLength(2);
    expect(result.jobs.map((j) => j.raw.url)).toEqual([
      'https://remoteok.com/remote-jobs/1',
      'https://remoteok.com/remote-jobs/2',
    ]);
  });

  // feature/01: "Respeitar o limite máximo de vagas coletadas por execução"
  it('caps the returned jobs by maxJobs', async () => {
    const config = makeConfig();
    config.discovery.sources = ['remoteok'];
    const result = await discoverJobs({ config, maxJobs: 1 });
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].raw.url).toBe('https://remoteok.com/remote-jobs/1');
  });

  // Expansion rounds (minJobsPerRun): sources already seen are dropped by
  // canonical URL, so a deeper call only surfaces genuinely new jobs.
  it('drops jobs whose canonical URL is in excludeUrls', async () => {
    const config = makeConfig();
    config.discovery.sources = ['remoteok'];
    const result = await discoverJobs({
      config,
      maxJobs: 10,
      excludeUrls: ['https://remoteok.com/remote-jobs/1?utm_campaign=y'],
    });
    expect(result.jobs.map((j) => j.raw.url)).toEqual(['https://remoteok.com/remote-jobs/2']);
  });

  it('perSourceMax overrides discovery.maxJobsPerSource in the adapter call', async () => {
    const config = makeConfig();
    config.discovery.sources = ['remoteok'];
    config.discovery.maxJobsPerSource = 20;
    await discoverJobs({ config, maxJobs: 100, perSourceMax: 40 });
    expect(lastCtx?.maxJobs).toBe(40);
  });

  it('exposes raw job inputs ready for the pipeline', async () => {
    const config = makeConfig();
    config.discovery.sources = ['remoteok'];
    const result = await discoverJobs({ config, maxJobs: 2 });
    const raw = toRawJobInputs(result.jobs);
    expect(raw).toHaveLength(2);
    for (const item of raw) {
      expect(item.url).toMatch(/^https:\/\//);
      expect(item.html).toContain('<html>');
    }
  });
});
