import type {
  SourceAdapter,
  SourceAdapterContext,
  DiscoveryResult,
  DiscoveryJob,
  DiscoveryError,
} from '../types';
import { rawJobFromNormalized, matchesTargetTitles } from '../normalizer';

/**
 * Boards públicos de ATS por empresa (feature/01 "portais ATS cadastrados").
 * Slugs vêm de `DISCOVERY_ATS_BOARDS` → `config.discovery.atsBoards`
 * (`{ greenhouse: ['acme'], lever: ['stripe'] }`). Greenhouse e Lever têm
 * APIs JSON públicas sem auth — a mesma listagem que o board expõe.
 * Demais providers (workday, icims…) seguem stub com mensagem acionável.
 */

const API_ENDPOINTS: Record<string, (slug: string) => string> = {
  greenhouse: (slug) =>
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
  lever: (slug) => `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
};

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

function mapGreenhouseJob(it: Record<string, unknown>): DiscoveryJob | null {
  const title = String(it.title ?? '');
  const url = String(it.absolute_url ?? '');
  if (!title || !url) return null;
  const loc = (it.location as { name?: string } | undefined)?.name ?? '';
  return rawJobFromNormalized(
    {
      url,
      title,
      company: String(it.company_name ?? ''),
      location: String(loc),
      descriptionHtml: String(it.content ?? ''),
      postedAt: it.updated_at ? String(it.updated_at) : undefined,
    },
    'Greenhouse',
    'greenhouse',
  );
}

function mapLeverJob(it: Record<string, unknown>, slug: string): DiscoveryJob | null {
  const title = String(it.text ?? '');
  const url = String(it.hostedUrl ?? '');
  if (!title || !url) return null;
  const cats = it.categories as
    { location?: string; team?: string; commitment?: string } | undefined;
  const lists = Array.isArray(it.lists)
    ? (it.lists as Array<{ text?: string; content?: string }>)
    : [];
  const listsHtml = lists
    .map((l) => `<h3>${l.text ?? ''}</h3><ul>${l.content ?? ''}</ul>`)
    .join('');
  return rawJobFromNormalized(
    {
      url,
      title,
      // posting não traz nome da empresa — o slug do board é a empresa
      company: slug,
      location: [cats?.location, cats?.team, cats?.commitment].filter(Boolean).join(' · '),
      descriptionHtml: String(it.description ?? it.descriptionPlain ?? '') + listsHtml,
      postedAt: it.createdAt ? new Date(Number(it.createdAt)).toISOString() : undefined,
    },
    'Lever',
    'lever',
  );
}

const MAPPERS: Record<string, (it: Record<string, unknown>, slug: string) => DiscoveryJob | null> =
  {
    greenhouse: mapGreenhouseJob,
    lever: mapLeverJob,
  };

/** Campo do payload com o título da vaga, por provider. */
const TITLE_KEY: Record<string, string> = { greenhouse: 'title', lever: 'text' };

const EXTRACT_ARRAY: Record<string, (data: unknown) => unknown[]> = {
  greenhouse: (d) => {
    const jobs = (d as { jobs?: unknown[] })?.jobs;
    return Array.isArray(jobs) ? jobs : [];
  },
  lever: (d) => (Array.isArray(d) ? d : []),
};

export const atsAdapter: SourceAdapter = {
  name: 'ats',
  async discover(ctx: SourceAdapterContext): Promise<DiscoveryResult> {
    const start = Date.now();
    const { source, fetcher, config, maxJobs } = ctx;

    // Cada source.id do grupo ats é um provider (greenhouse, lever…).
    // Providers sem suporte ainda → erro informativo, sem quebrar o ciclo.
    const endpoint = API_ENDPOINTS[source.id];
    const mapper = MAPPERS[source.id];
    if (!endpoint || !mapper) {
      return {
        jobs: [],
        errors: [
          buildError(
            source.id,
            'unknown',
            `ATS ${source.name}: sem suporte ainda — Greenhouse e Lever funcionam via DISCOVERY_ATS_BOARDS.`,
          ),
        ],
        meta: metaBase(1, 0, 0, 0, 0, start),
      };
    }

    const slugs = config.discovery.atsBoards?.[source.id] ?? [];
    if (!slugs.length) {
      return {
        jobs: [],
        errors: [
          buildError(
            source.id,
            'unknown',
            `Sem boards configurados p/ ${source.name} — defina DISCOVERY_ATS_BOARDS=${source.id}:<slug-da-empresa> (slug = o do boards.greenhouse.io/<slug> ou jobs.lever.co/<slug>).`,
          ),
        ],
        meta: metaBase(1, 0, 0, 0, 0, start),
      };
    }

    const jobs: DiscoveryJob[] = [];
    const errors: DiscoveryError[] = [];
    let succeeded = 0;
    for (const slug of slugs) {
      if (jobs.length >= maxJobs || ctx.signal?.aborted) break;
      const url = endpoint(slug);
      try {
        const res = await fetcher.fetchJson<unknown>(url);
        if (res.status === 404) {
          errors.push(
            buildError(
              source.id,
              'parse',
              `Board "${slug}" não existe (404) — confira o slug`,
              url,
            ),
          );
          continue;
        }
        if (res.status !== 200) throw new Error(`${source.name} returned ${res.status}`);
        succeeded++;
        for (const item of EXTRACT_ARRAY[source.id](res.data)) {
          if (!item || typeof item !== 'object') continue;
          const it = item as Record<string, unknown>;
          const title = String(it[TITLE_KEY[source.id]] ?? '');
          if (!title || !matchesTargetTitles(title, config.discovery.targetTitles)) continue;
          const job = mapper(it, slug);
          if (!job) continue;
          jobs.push(job);
          if (jobs.length >= maxJobs) break;
        }
      } catch (e) {
        errors.push(
          buildError(source.id, 'parse', `${slug}: ${e instanceof Error ? e.message : e}`, url),
        );
      }
    }

    const deduped = dedupJobs(jobs).slice(0, maxJobs);
    return {
      jobs: deduped,
      errors,
      meta: metaBase(slugs.length, succeeded, jobs.length, deduped.length, deduped.length, start),
    };
  },
};
