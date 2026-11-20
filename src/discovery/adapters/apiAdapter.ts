import type {
  SourceAdapter,
  SourceAdapterContext,
  DiscoveryResult,
  DiscoveryJob,
  DiscoveryError,
} from '../types';
import { rawJobFromNormalized, matchesTargetTitles } from '../normalizer';

function metaBase(
  tried: number,
  succeeded: number,
  raw: number,
  afterDedup: number,
  afterFilters: number,
  start: number,
): DiscoveryResult['meta'] {
  return {
    sourcesTried: tried,
    sourcesSucceeded: succeeded,
    totalRaw: raw,
    afterDedup,
    afterFilters,
    durationMs: Date.now() - start,
  };
}

function buildError(
  sourceId: string,
  phase: DiscoveryError['phase'],
  message: string,
  url?: string,
): DiscoveryError {
  return { sourceId, phase, message, url };
}

function salaryFromMinMax(
  min?: number,
  max?: number,
  currency?: string,
  period?: string,
): string | undefined {
  if (min == null && max == null) return undefined;
  const parts: string[] = [];
  if (min != null) parts.push(String(min));
  if (max != null && max !== min) parts.push(max > (min ?? 0) ? `-${max}` : String(max));
  let s = parts.join('');
  if (currency) s = `${currency} ${s}`;
  if (period) s = `${s} (${period})`;
  return s;
}

export const apiAdapter: SourceAdapter = {
  name: 'api',
  async discover(ctx: SourceAdapterContext): Promise<DiscoveryResult> {
    const start = Date.now();
    const { source, maxJobs } = ctx;
    try {
      let jobs: DiscoveryJob[] = [];
      switch (source.id) {
        case 'remoteok':
          jobs = await remoteok(ctx);
          break;
        case 'remotive':
          jobs = await remotive(ctx);
          break;
        case 'jobicy':
          jobs = await jobicy(ctx);
          break;
        case 'arbeitnow':
          jobs = await arbeitnow(ctx);
          break;
        case 'workingnomads':
          jobs = await workingnomads(ctx);
          break;
        case 'himalayas':
          jobs = await himalayas(ctx);
          break;
        default:
          return {
            jobs: [],
            errors: [
              buildError(
                source.id,
                'unknown',
                `API adapter not implemented for source ${source.id}`,
              ),
            ],
            meta: metaBase(1, 0, 0, 0, 0, start),
          };
      }
      const afterFilters = jobs.length;
      const deduped = dedupJobs(jobs);
      const limited = deduped.slice(0, maxJobs);
      return {
        jobs: limited,
        errors: [],
        meta: metaBase(1, 1, afterFilters, deduped.length, limited.length, start),
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        jobs: [],
        errors: [buildError(source.id, 'parse', message)],
        meta: metaBase(1, 0, 0, 0, 0, start),
      };
    }
  },
};

function dedupJobs(jobs: DiscoveryJob[]): DiscoveryJob[] {
  const seen = new Set<string>();
  return jobs.filter((j) => {
    try {
      const u = new URL(j.raw.url);
      const key = `${u.hostname}${u.pathname}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    } catch {
      return true;
    }
  });
}

async function remoteok(ctx: SourceAdapterContext): Promise<DiscoveryJob[]> {
  const { source, fetcher, config } = ctx;
  const res = await fetcher.fetchJson<unknown[]>(source.apiEndpoint!);
  if (res.status !== 200) throw new Error(`RemoteOK returned ${res.status}`);
  const arr = Array.isArray(res.data) ? res.data : [];
  const out: DiscoveryJob[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, unknown>;
    if ('legal' in it || 'last_updated' in it) continue; // skip disclaimer
    const title = String(it.position ?? '');
    if (!matchesTargetTitles(title, config.discovery.targetTitles)) continue;
    const url = String(it.url ?? it.apply_url ?? '');
    if (!url) continue;
    out.push(
      rawJobFromNormalized(
        {
          url,
          title,
          company: String(it.company ?? ''),
          location: String(it.location ?? ''),
          descriptionHtml: String(it.description ?? ''),
          salaryRange: salaryFromMinMax(
            it.salary_min ? Number(it.salary_min) : undefined,
            it.salary_max ? Number(it.salary_max) : undefined,
          ),
          postedAt: it.date ? String(it.date) : undefined,
        },
        source.name,
        source.id,
      ),
    );
    if (out.length >= ctx.maxJobs) break;
  }
  return out;
}

async function remotive(ctx: SourceAdapterContext): Promise<DiscoveryJob[]> {
  const { source, fetcher, config } = ctx;
  const res = await fetcher.fetchJson<{ jobs?: unknown[] }>(source.apiEndpoint!);
  if (res.status !== 200) throw new Error(`Remotive returned ${res.status}`);
  const arr = Array.isArray(res.data?.jobs) ? res.data.jobs! : [];
  const out: DiscoveryJob[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, unknown>;
    const title = String(it.title ?? '');
    if (!title || !matchesTargetTitles(title, config.discovery.targetTitles)) continue;
    const url = String(it.url ?? '');
    if (!url) continue;
    out.push(
      rawJobFromNormalized(
        {
          url,
          title,
          company: String(it.company_name ?? ''),
          location: String(it.candidate_required_location ?? ''),
          descriptionHtml: String(it.description ?? ''),
          salaryRange: it.salary ? String(it.salary) : undefined,
          postedAt: it.publication_date ? String(it.publication_date) : undefined,
        },
        source.name,
        source.id,
      ),
    );
    if (out.length >= ctx.maxJobs) break;
  }
  return out;
}

async function jobicy(ctx: SourceAdapterContext): Promise<DiscoveryJob[]> {
  const { source, fetcher, config } = ctx;
  const endpoint = source.apiEndpoint!;
  const res = await fetcher.fetchJson<{ jobs?: unknown[] }>(endpoint);
  if (res.status !== 200) throw new Error(`Jobicy returned ${res.status}`);
  const arr = Array.isArray(res.data?.jobs) ? res.data.jobs! : [];
  const out: DiscoveryJob[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, unknown>;
    const title = String(it.jobTitle ?? '');
    if (!title || !matchesTargetTitles(title, config.discovery.targetTitles)) continue;
    const url = String(it.url ?? '');
    if (!url) continue;
    out.push(
      rawJobFromNormalized(
        {
          url,
          title,
          company: String(it.companyName ?? ''),
          location: String(it.jobGeo ?? ''),
          descriptionHtml: String(it.jobDescription ?? it.jobExcerpt ?? ''),
          postedAt: it.pubDate ? String(it.pubDate) : undefined,
        },
        source.name,
        source.id,
      ),
    );
    if (out.length >= ctx.maxJobs) break;
  }
  return out;
}

async function arbeitnow(ctx: SourceAdapterContext): Promise<DiscoveryJob[]> {
  const { source, fetcher, config } = ctx;
  const res = await fetcher.fetchJson<{ data?: unknown[] }>(`${source.apiEndpoint!}?page=1`);
  if (res.status !== 200) throw new Error(`Arbeitnow returned ${res.status}`);
  const arr = Array.isArray(res.data?.data) ? res.data.data! : [];
  const out: DiscoveryJob[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, unknown>;
    const title = String(it.title ?? '');
    if (!title || !matchesTargetTitles(title, config.discovery.targetTitles)) continue;
    const url = String(it.url ?? '');
    if (!url) continue;
    const loc = [it.location, it.job_types, it.remote ? 'remote' : ''].filter(Boolean).join(' · ');
    out.push(
      rawJobFromNormalized(
        {
          url,
          title,
          company: String(it.company_name ?? ''),
          location: loc,
          descriptionHtml: String(it.description ?? ''),
          postedAt: it.created_at ? String(it.created_at) : undefined,
        },
        source.name,
        source.id,
      ),
    );
    if (out.length >= ctx.maxJobs) break;
  }
  return out;
}

async function workingnomads(ctx: SourceAdapterContext): Promise<DiscoveryJob[]> {
  const { source, fetcher, config } = ctx;
  const res = await fetcher.fetchJson<unknown[]>(source.apiEndpoint!);
  if (res.status !== 200) throw new Error(`Working Nomads returned ${res.status}`);
  const arr = Array.isArray(res.data) ? res.data : [];
  const out: DiscoveryJob[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, unknown>;
    const title = String(it.title ?? '');
    if (!title || !matchesTargetTitles(title, config.discovery.targetTitles)) continue;
    const url = String(it.url ?? '');
    if (!url) continue;
    out.push(
      rawJobFromNormalized(
        {
          url,
          title,
          company: String(it.company_name ?? ''),
          location: String(it.location ?? ''),
          descriptionHtml: String(it.description ?? ''),
          postedAt: it.pub_date ? String(it.pub_date) : undefined,
        },
        source.name,
        source.id,
      ),
    );
    if (out.length >= ctx.maxJobs) break;
  }
  return out;
}

async function himalayas(ctx: SourceAdapterContext): Promise<DiscoveryJob[]> {
  const { source, fetcher, config } = ctx;
  const endpoint = `${source.apiEndpoint!}?limit=50`;
  const res = await fetcher.fetchJson<{ jobs?: unknown[] }>(endpoint);
  if (res.status !== 200) throw new Error(`Himalayas returned ${res.status}`);
  const arr = Array.isArray(res.data?.jobs) ? res.data.jobs! : [];
  const out: DiscoveryJob[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, unknown>;
    const title = String(it.title ?? '');
    if (!title || !matchesTargetTitles(title, config.discovery.targetTitles)) continue;
    const url = String(it.applicationLink ?? it.guid ?? '');
    if (!url) continue;
    out.push(
      rawJobFromNormalized(
        {
          url,
          title,
          company: String(it.companyName ?? ''),
          location: String(it.locationRestrictions ?? ''),
          descriptionHtml: String(it.description ?? it.excerpt ?? ''),
          salaryRange: salaryFromMinMax(
            it.minSalary ? Number(it.minSalary) : undefined,
            it.maxSalary ? Number(it.maxSalary) : undefined,
            it.currency ? String(it.currency) : undefined,
            it.salaryPeriod ? String(it.salaryPeriod) : undefined,
          ),
          postedAt: it.pubDate ? String(it.pubDate) : undefined,
        },
        source.name,
        source.id,
      ),
    );
    if (out.length >= ctx.maxJobs) break;
  }
  return out;
}
