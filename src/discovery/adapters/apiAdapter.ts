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
        case 'hnhiring':
          jobs = await hnHiring(ctx);
          break;
        case 'hnjobs':
          jobs = await hnJobs(ctx);
          break;
        case 'ghfrontendbr':
        case 'ghbackendbr':
        case 'ghreactbr':
          jobs = await githubIssues(ctx);
          break;
        case 'gupy':
          jobs = await gupy(ctx);
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
    // apply_url do RemoteOK aponta o ATS externo real — preferir ela faz o
    // pipeline aterrissar direto no formulário de candidatura.
    const url = String(it.apply_url ?? it.url ?? '');
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

/** Regiões do config → geo do jobicy. Demais regiões ficam globais. */
const JOBICY_GEO: Record<string, string> = {
  BR: 'brazil',
  US: 'usa',
  PT: 'portugal',
};

async function jobicy(ctx: SourceAdapterContext): Promise<DiscoveryJob[]> {
  const { source, fetcher, config } = ctx;
  // Busca derivada da config: count = teto da chamada; geo = 1ª região
  // mapeável de DISCOVERY_REGIONS (LATAM/EU/GLOBAL/vazio → sem geo).
  // Sem `tag`: o filtro local por títulos já cobre e um tag errado esvaziaria.
  const params = new URLSearchParams({ count: String(Math.min(ctx.maxJobs, 50)) });
  const geo = (config.discovery.regions ?? [])
    .map((r) => JOBICY_GEO[String(r).toUpperCase()])
    .find(Boolean);
  if (geo) params.set('geo', geo);
  const res = await fetcher.fetchJson<{ jobs?: unknown[] }>(
    `${source.apiEndpoint!}?${params.toString()}`,
  );
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

async function gupy(ctx: SourceAdapterContext): Promise<DiscoveryJob[]> {
  const { source, fetcher, config } = ctx;
  const out: DiscoveryJob[] = [];
  const seen = new Set<number>();
  // A API pagina limit/offset (50/página) e filtra jobName server-side —
  // uma busca por título-alvo evita varrer o catálogo inteiro (~80k vagas).
  // Sem título-alvo configurado, varre as páginas mais recentes no geral.
  const titles = config.discovery.targetTitles.length ? config.discovery.targetTitles : [''];
  for (const title of titles) {
    for (let offset = 0; out.length < ctx.maxJobs && offset < 500; offset += 50) {
      const params = new URLSearchParams({
        limit: '50',
        offset: String(offset),
        sortBy: 'publishedDate',
      });
      if (title) params.set('jobName', title);
      const res = await fetcher.fetchJson<{ data?: unknown[] }>(
        `${source.apiEndpoint!}?${params.toString()}`,
      );
      if (res.status !== 200) throw new Error(`Gupy returned ${res.status}`);
      const arr = Array.isArray(res.data?.data) ? res.data.data! : [];
      if (!arr.length) break;
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue;
        const it = item as Record<string, unknown>;
        const id = Number(it.id ?? 0);
        const name = String(it.name ?? '');
        const url = String(it.jobUrl ?? '');
        if (!name || !url || seen.has(id)) continue;
        if (!matchesTargetTitles(name, config.discovery.targetTitles)) continue;
        seen.add(id);
        out.push(
          rawJobFromNormalized(
            {
              url,
              title: name,
              company: String(it.careerPageName ?? ''),
              location: [it.city, it.state, it.workplaceType].filter(Boolean).join(' · '),
              descriptionHtml: String(it.description ?? ''),
              postedAt: it.publishedDate ? String(it.publishedDate) : undefined,
            },
            source.name,
            source.id,
          ),
        );
        if (out.length >= ctx.maxJobs) break;
      }
      if (arr.length < 50) break; // última página
    }
    if (out.length >= ctx.maxJobs) break;
  }
  return out;
}

async function arbeitnow(ctx: SourceAdapterContext): Promise<DiscoveryJob[]> {
  const { source, fetcher, config } = ctx;
  const out: DiscoveryJob[] = [];
  // JSON paginado (?page=N): varre até encher maxJobs ou página vir vazia —
  // cap 5 páginas p/ bounding de requests.
  for (let page = 1; page <= 5 && out.length < ctx.maxJobs; page++) {
    const res = await fetcher.fetchJson<{ data?: unknown[] }>(
      `${source.apiEndpoint!}?page=${page}`,
    );
    if (res.status !== 200) throw new Error(`Arbeitnow returned ${res.status}`);
    const arr = Array.isArray(res.data?.data) ? res.data.data! : [];
    if (!arr.length) break;
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const it = item as Record<string, unknown>;
      const title = String(it.title ?? '');
      if (!title || !matchesTargetTitles(title, config.discovery.targetTitles)) continue;
      const url = String(it.url ?? '');
      if (!url) continue;
      const loc = [it.location, it.job_types, it.remote ? 'remote' : '']
        .filter(Boolean)
        .join(' · ');
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

const stripHtmlLite = (h: string) =>
  h
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;|&quot;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/**
 * HN "Who is hiring" posts começam "Empresa | Cargo | Local | …" ou
 * "Empresa – Cargo". Pega o segmento com palavra de função; fallback 1ª linha.
 */
function hnTitleFromText(html: string): string {
  const first = stripHtmlLite(html.split(/<p>/i)[0] ?? html).slice(0, 160);
  const parts = first.split(/\s*\|\s*|\s+[—–-]\s+/).filter(Boolean);
  const roleRe =
    /engineer|developer|dev\b|designer|architect|manager|lead|scientist|analyst|sre|programador|desenvolvedor|engenheiro|dados|security/i;
  const role = parts.find((p) => roleRe.test(p));
  return (role ?? parts[1] ?? parts[0] ?? '').slice(0, 120);
}

/**
 * Hacker News — thread mensal "Ask HN: Who is hiring?". Cada comentário é um
 * post de vaga com contato direto (e-mail) no corpo — alto rendimento de
 * candidaturas por canal de mensagem. Algolia API pública, sem chave.
 */
async function hnHiring(ctx: SourceAdapterContext): Promise<DiscoveryJob[]> {
  const { source, fetcher, config } = ctx;
  const api = source.apiEndpoint!.replace(/\/$/, '');
  const search = await fetcher.fetchJson<{ hits?: Array<{ objectID?: string }> }>(
    `${api}/search?tags=story&query=${encodeURIComponent('Ask HN: Who is hiring?')}`,
  );
  if (search.status !== 200) throw new Error(`HN Algolia search returned ${search.status}`);
  const storyId = search.data?.hits?.find((h) => h.objectID)?.objectID;
  if (!storyId) return [];
  const thread = await fetcher.fetchJson<{ children?: unknown[] }>(`${api}/items/${storyId}`);
  if (thread.status !== 200) throw new Error(`HN Algolia items returned ${thread.status}`);
  const comments = Array.isArray(thread.data?.children) ? thread.data.children : [];
  const out: DiscoveryJob[] = [];
  for (const c of comments) {
    if (!c || typeof c !== 'object') continue;
    const it = c as Record<string, unknown>;
    const text = String(it.text ?? '');
    const id = it.id;
    if (!text.trim() || id == null) continue;
    const title = hnTitleFromText(text);
    // O title-match vê título + início do corpo — posts sem cargo na 1ª
    // linha ainda passam quando a função aparece logo no texto.
    const matchText = `${title} ${stripHtmlLite(text).slice(0, 160)}`;
    if (!matchesTargetTitles(matchText, config.discovery.targetTitles)) continue;
    out.push(
      rawJobFromNormalized(
        {
          url: `https://news.ycombinator.com/item?id=${id}`,
          title: title || 'Hiring post',
          descriptionHtml: `<p>${text}</p>`,
        },
        source.name,
        source.id,
      ),
    );
    if (out.length >= ctx.maxJobs) break;
  }
  return out;
}

/**
 * HN Jobs oficial (Firebase API) — posts de vagas das empresas YC. `it.url`
 * já é o link externo de candidatura; `it.text` pode trazer e-mail/contato.
 * Cada item = 1 request sequencial (rate limiter serializa por domínio).
 */
async function hnJobs(ctx: SourceAdapterContext): Promise<DiscoveryJob[]> {
  const { source, fetcher, config } = ctx;
  const api = source.apiEndpoint!.replace(/\/$/, '');
  const idsRes = await fetcher.fetchJson<number[]>(`${api}/jobstories.json`);
  if (idsRes.status !== 200) throw new Error(`HN jobstories returned ${idsRes.status}`);
  const ids = Array.isArray(idsRes.data) ? idsRes.data.slice(0, ctx.maxJobs) : [];
  const out: DiscoveryJob[] = [];
  for (const id of ids) {
    const res = await fetcher.fetchJson<Record<string, unknown>>(`${api}/item/${id}.json`);
    if (res.status !== 200 || !res.data || res.data.type !== 'job') continue;
    const it = res.data;
    const title = String(it.title ?? '');
    if (!title || !matchesTargetTitles(title, config.discovery.targetTitles)) continue;
    out.push(
      rawJobFromNormalized(
        {
          url: String(it.url ?? '') || `https://news.ycombinator.com/item?id=${id}`,
          title,
          descriptionHtml: String(it.text ?? ''),
          postedAt: it.time ? new Date(Number(it.time) * 1000).toISOString() : undefined,
        },
        source.name,
        source.id,
      ),
    );
    if (out.length >= ctx.maxJobs) break;
  }
  return out;
}

/** Labels dos repos de vagas BR → modelo/contrato do job normalizado. */
function ghLabelFields(labels: string[]): { workModel?: string; contractType?: string } {
  const lower = labels.map((l) => l.toLowerCase());
  const workModel = lower.some((l) => l.includes('remot'))
    ? 'REMOTE'
    : lower.some((l) => l.includes('hibrid') || l.includes('híbrido'))
      ? 'HYBRID'
      : lower.some((l) => l.includes('alocado') || l.includes('presencial'))
        ? 'ONSITE'
        : undefined;
  const contractType = labels
    .find((l) => /^(clt|pj|freelance|estágio|estagio)$/i.test(l.trim()))
    ?.toUpperCase();
  return { workModel, contractType };
}

/**
 * Repositórios GitHub de vagas BR (frontendbr/backend-br/react-brasil) —
 * issues abertas são as vagas. 1 request traz título, labels (modelo,
 * senioridade, stack) e corpo com e-mail/link de candidatura.
 */
async function githubIssues(ctx: SourceAdapterContext): Promise<DiscoveryJob[]> {
  const { source, fetcher, config } = ctx;
  const url = `${source.apiEndpoint!}?state=open&per_page=${Math.min(ctx.maxJobs, 100)}`;
  const res = await fetcher.fetchJson<unknown[]>(url, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (res.status !== 200) throw new Error(`GitHub issues returned ${res.status}`);
  const arr = Array.isArray(res.data) ? res.data : [];
  const out: DiscoveryJob[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, unknown>;
    if (it.pull_request) continue; // a API mistura PRs
    const title = String(it.title ?? '');
    if (!title || !matchesTargetTitles(title, config.discovery.targetTitles)) continue;
    const issueUrl = String(it.html_url ?? '');
    if (!issueUrl) continue;
    const labels = Array.isArray(it.labels)
      ? (it.labels as Array<{ name?: string }>).map((l) => String(l?.name ?? ''))
      : [];
    const fields = ghLabelFields(labels);
    const body = String(it.body ?? '');
    out.push(
      rawJobFromNormalized(
        {
          url: issueUrl,
          title,
          company: String((it.user as Record<string, unknown>)?.login ?? ''),
          location: labels.join(', '),
          descriptionHtml:
            `<p>${body.replace(/\n/g, '<br>')}</p>` +
            (labels.length ? `<p><strong>Labels:</strong> ${labels.join(', ')}</p>` : ''),
          workModel: fields.workModel,
          contractType: fields.contractType,
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
