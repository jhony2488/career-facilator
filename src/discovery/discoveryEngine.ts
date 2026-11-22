import { createFetcher } from './fetcher';
import { RateLimiter } from './rateLimiter';
import { getActiveSources } from './sourceRegistry';
import { getAdapter } from './adapters';
import { isJobListingUrl } from './normalizer';
import type {
  DiscoveryOptions,
  DiscoveryResult,
  DiscoveryJob,
  RawJobInput,
  DiscoveryError,
} from './types';

export async function discoverJobs(opts: DiscoveryOptions): Promise<DiscoveryResult> {
  const { config, sourceIds, maxJobs } = opts;
  const start = Date.now();
  const globalMax = maxJobs ?? config.execution.maxJobsPerRun;
  const perSourceMax = opts.perSourceMax ?? config.discovery.maxJobsPerSource;
  const excluded = new Set<string>();
  for (const u of opts.excludeUrls ?? []) {
    const key = canonicalKey(u);
    if (key) excluded.add(key);
  }

  const rateLimiter = new RateLimiter(config.discovery.perDomainDelayMs);
  const fetcher = createFetcher({ rateLimiter });

  const allowlistProvided = Boolean(sourceIds?.length || config.discovery.sources?.length);
  const sources = getActiveSources(config, {
    sourceIds,
    includeRisky: allowlistProvided,
    includeAuth: allowlistProvided,
  });
  if (sources.length === 0) {
    return {
      jobs: [],
      errors: [
        {
          sourceId: 'registry',
          phase: 'unknown',
          message: 'No active discovery sources for the current configuration.',
        },
      ],
      meta: {
        sourcesTried: 0,
        sourcesSucceeded: 0,
        totalRaw: 0,
        afterDedup: 0,
        afterFilters: 0,
        durationMs: 0,
      },
    };
  }

  const allJobs: DiscoveryJob[] = [];
  const allErrors: DiscoveryError[] = [];
  const perSource: { sourceId: string; jobs: number; errors: number }[] = [];
  let sourcesSucceeded = 0;
  let sourcesTried = 0;
  const concurrency = Math.max(1, config.discovery.concurrency);

  for (let i = 0; i < sources.length; i += concurrency) {
    if (opts.signal?.aborted) break;
    const remaining = globalMax - allJobs.length;
    if (remaining <= 0) break;
    const chunk = sources.slice(i, i + concurrency);
    sourcesTried += chunk.length;
    const results = await Promise.all(
      chunk.map(async (source) => {
        const adapter = getAdapter(source.adapter);
        if (!adapter) {
          return {
            sourceId: source.id,
            jobs: [] as DiscoveryJob[],
            errors: [
              {
                sourceId: source.id,
                phase: 'unknown' as const,
                message: `No adapter registered for ${source.adapter}`,
              },
            ],
          };
        }
        try {
          const result = await adapter.discover({
            config,
            source,
            fetcher,
            signal: opts.signal,
            maxJobs: Math.min(perSourceMax, remaining),
            extract: opts.extract,
            renderText: opts.renderText,
          });
          return { sourceId: source.id, jobs: result.jobs, errors: result.errors };
        } catch (e) {
          return {
            sourceId: source.id,
            jobs: [] as DiscoveryJob[],
            errors: [
              {
                sourceId: source.id,
                phase: 'unknown' as const,
                message: e instanceof Error ? e.message : String(e),
              },
            ],
          };
        }
      }),
    );
    for (const r of results) {
      allJobs.push(...r.jobs);
      allErrors.push(...r.errors);
      perSource.push({ sourceId: r.sourceId, jobs: r.jobs.length, errors: r.errors.length });
      if (r.jobs.length > 0 || r.errors.length === 0) sourcesSucceeded++;
    }
  }

  const deduped = dedupByUrl(allJobs)
    .filter((j) => !excluded.has(canonicalKey(j.raw.url) ?? ''))
    // Última malha: nenhum adapter deve emitir página de busca (ex.: /jobs/<termo>).
    .filter((j) => isJobListingUrl(j.raw.url));
  const limited = deduped.slice(0, globalMax);

  return {
    jobs: limited,
    errors: allErrors,
    perSource,
    meta: {
      sourcesTried,
      sourcesSucceeded,
      totalRaw: allJobs.length,
      afterDedup: deduped.length,
      afterFilters: limited.length,
      durationMs: Date.now() - start,
    },
  };
}

/** Chave canônica de dedup: host+path (ignora protocolo, query e fragmento). */
function canonicalKey(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return null;
  }
}

function dedupByUrl(jobs: DiscoveryJob[]): DiscoveryJob[] {
  const seen = new Set<string>();
  return jobs.filter((j) => {
    const key = canonicalKey(j.raw.url);
    if (key === null) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function toRawJobInputs(jobs: DiscoveryJob[]): RawJobInput[] {
  return jobs.map((j) => j.raw);
}
