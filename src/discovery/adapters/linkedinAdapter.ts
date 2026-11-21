import { parse } from 'node-html-parser';
import type {
  SourceAdapter,
  SourceAdapterContext,
  DiscoveryResult,
  DiscoveryJob,
  DiscoveryError,
} from '../types';
import { rawJobFromNormalized, matchesTargetTitles } from '../normalizer';

/**
 * LinkedIn Jobs (feature/01 "alertas salvos com sessão autenticada"): busca
 * por título-alvo via `renderText` no browser persistente do usuário — a
 * sessão do `career login linkedin` (AUTOFILL_/DISCOVERY_BROWSER_PROFILE_DIR)
 * é reaproveitada. Cards → links `/jobs/view/<id>`; descrição via render da
 * página da vaga (guest view do LinkedIn é público mas bloqueia HTTP puro).
 */

export interface LinkedInCard {
  id: string;
  url: string;
  title: string;
  company: string;
  location: string;
}

const JOB_ID_RE = /\/jobs\/view\/[^?#"]*?(\d{5,})/;

/** Parser puro do HTML da busca — testável sem navegador. */
export function parseLinkedInSearchHtml(html: string): LinkedInCard[] {
  const root = parse(html);
  const out: LinkedInCard[] = [];
  const seen = new Set<string>();
  for (const a of root.querySelectorAll('a[href*="/jobs/view/"]')) {
    const m = (a.getAttribute('href') ?? '').match(JOB_ID_RE);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    const card =
      a.closest('li') ?? a.closest('div.base-card') ?? a.closest('[class*="job-card"]') ?? a;
    const pick = (sel: string, fallback = ''): string =>
      (card.querySelector(sel)?.text ?? fallback).replace(/\s+/g, ' ').trim();
    out.push({
      id: m[1],
      url: `https://www.linkedin.com/jobs/view/${m[1]}`,
      title:
        pick('.base-search-card__title, .job-card-list__title, .job-card-container__title') ||
        (a.text || '').replace(/\s+/g, ' ').trim(),
      company: pick('.base-search-card__subtitle, .job-card-container__company-name'),
      location: pick('.job-search-card__location, .job-card-container__metadata-item'),
    });
  }
  return out;
}

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

function buildError(sourceId: string, message: string): DiscoveryError {
  return { sourceId, phase: 'unknown', message };
}

const AUTHWALL_RE = /authwall|\/login\b|checkpoint\/lg/i;

export const linkedinAdapter: SourceAdapter = {
  name: 'linkedin',
  async discover(ctx: SourceAdapterContext): Promise<DiscoveryResult> {
    const start = Date.now();
    const { source, config, maxJobs } = ctx;

    // Sessão obrigatória: renderText só existe quando o profileDir do browser
    // persistente está configurado (mesmo contexto do autofill/login).
    if (!ctx.renderText) {
      return {
        jobs: [],
        errors: [
          buildError(
            source.id,
            'LinkedIn exige sessão autenticada — configure AUTOFILL_PROFILE_DIR/DISCOVERY_BROWSER_PROFILE_DIR e rode `career login linkedin`.',
          ),
        ],
        meta: metaBase(1, 0, 0, 0, 0, start),
      };
    }

    const titles = config.discovery.targetTitles.length ? config.discovery.targetTitles : [''];
    const jobs: DiscoveryJob[] = [];
    const errors: DiscoveryError[] = [];
    const seen = new Set<string>();
    let searchesOk = 0;

    for (const title of titles) {
      if (jobs.length >= maxJobs || ctx.signal?.aborted) break;
      const searchUrl =
        `https://www.linkedin.com/jobs/search?f_TPR=r86400` +
        (title ? `&keywords=${encodeURIComponent(title)}` : '');
      let page: Awaited<ReturnType<NonNullable<typeof ctx.renderText>>>;
      try {
        page = await ctx.renderText(searchUrl);
      } catch (e) {
        errors.push(buildError(source.id, `busca "${title}": ${String(e).slice(0, 120)}`));
        continue;
      }
      // Authwall: sessão expirada/ausente — aciona o login manual, não o loop.
      if (
        AUTHWALL_RE.test(page.url) ||
        (AUTHWALL_RE.test(page.text.slice(0, 3000)) && !page.text.includes('/jobs/view/'))
      ) {
        return {
          jobs,
          errors: [
            ...errors,
            buildError(
              source.id,
              'Sessão LinkedIn expirada ou ausente — rode `career login linkedin` e tente de novo.',
            ),
          ],
          meta: metaBase(titles.length, searchesOk, jobs.length, jobs.length, jobs.length, start),
        };
      }
      searchesOk++;
      for (const card of parseLinkedInSearchHtml(page.text)) {
        if (jobs.length >= maxJobs || ctx.signal?.aborted) break;
        if (seen.has(card.id)) continue;
        seen.add(card.id);
        if (title && !matchesTargetTitles(card.title, config.discovery.targetTitles)) continue;
        try {
          const detail = await ctx.renderText(card.url);
          jobs.push(
            rawJobFromNormalized(
              {
                url: card.url,
                title: card.title,
                company: card.company,
                location: card.location,
                descriptionHtml: detail.text.slice(0, 80_000),
              },
              source.name,
              source.id,
            ),
          );
        } catch {
          // sem a página de detalhe a vaga não alimenta a triagem — descarta
        }
      }
    }

    return {
      jobs,
      errors,
      meta: metaBase(titles.length, searchesOk, jobs.length, jobs.length, jobs.length, start),
    };
  },
};
