import { parse } from 'node-html-parser';
import type {
  SourceAdapter,
  SourceAdapterContext,
  DiscoveryResult,
  DiscoveryJob,
  DiscoveryError,
} from '../types';
import { rawJobFromNormalized, matchesTargetTitles } from '../normalizer';
import { extractContacts, hasAnyContact, applyLinkOf } from '../postContacts';
import { ocrImageUrl, disposeOcrWorker } from '../imageOcr';

/**
 * LinkedIn (feature/01 "alertas salvos com sessão autenticada"): busca jobs
 * (`/jobs/search`) **e** posts de divulgação (`/search/results/content/`) por
 * título-alvo via `renderText` no browser persistente — a sessão do
 * `career login linkedin` é reaproveitada.
 *
 * Posts: e-mail/link/WhatsApp saem do texto; sem contato no texto, OCR
 * (tesseract.js) lê as imagens do post. Post sem canal nenhum ainda vira
 * DiscoveryJob → cai `NEEDS_HUMAN_INPUT` na fila de revisão.
 */

export interface LinkedInCard {
  id: string;
  url: string;
  title: string;
  company: string;
  location: string;
}

export interface LinkedInPost {
  id: string;
  url: string;
  snippet: string;
  author: string;
}

const JOB_ID_RE = /\/jobs\/view\/[^?#"]*?(\d{5,})/;
const POST_URN_RE = /(?:\/feed\/update\/urn:li:activity:|activity-)?:?(\d{15,20})/;
const POST_TEXT_SEL =
  '.update-components-text, .feed-shared-update-v2__description, .feed-shared-text, .break-words';
const POST_AUTHOR_SEL = '.update-components-actor__name, .feed-shared-actor__name, .actor-name';
const LICDN_IMG_RE = /media\.licdn\.com/;
/** Post só entra se falar de vaga — evita poluir a fila de revisão. */
const POST_JOBISH_RE =
  /vaga|contratand|hiring|oportunidade|job opening|position|apply|apply now|faça parte|join (our|the)|we are looking|estamos (procurando|contratando)/i;

/** Máx. posts renderizados por título (cada render é caro). */
const POSTS_PER_TITLE = 10;
/** Máx. imagens por post enviadas ao OCR. */
const IMAGES_PER_POST = 3;

/** Parser puro do HTML da busca de jobs — testável sem navegador. */
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

/** Parser puro do HTML da busca de conteúdo (posts) — testável sem navegador. */
export function parseLinkedInPostsHtml(html: string): LinkedInPost[] {
  const root = parse(html);
  const out: LinkedInPost[] = [];
  const seen = new Set<string>();
  for (const a of root.querySelectorAll(
    'a[href*="/feed/update/urn:li:activity"], a[href*="/posts/"], a[href*="/feed/update/"]',
  )) {
    const href = a.getAttribute('href') ?? '';
    const m = href.match(POST_URN_RE);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    const card = a.closest('.feed-shared-update-v2') ?? a.closest('li') ?? a;
    const pick = (sel: string, fallback = ''): string =>
      (card.querySelector(sel)?.text ?? fallback).replace(/\s+/g, ' ').trim();
    const path = href.split('?')[0];
    out.push({
      id: m[1],
      url: path.startsWith('http') ? path : `https://www.linkedin.com${path}`,
      snippet: pick(POST_TEXT_SEL) || (a.text || '').replace(/\s+/g, ' ').trim(),
      author: pick(POST_AUTHOR_SEL),
    });
  }
  return out;
}

/** Texto + autores + imagens de um post renderizado (página do post). */
export function parseLinkedInPostDetail(html: string): {
  text: string;
  author: string;
  imageUrls: string[];
} {
  const root = parse(html);
  const text = (root.querySelector(POST_TEXT_SEL)?.text ?? '').replace(/\s+/g, ' ').trim();
  const author = (root.querySelector(POST_AUTHOR_SEL)?.text ?? '').replace(/\s+/g, ' ').trim();
  const imageUrls = [
    ...new Set(
      root
        .querySelectorAll('img')
        .map((i) => i.getAttribute('src') ?? '')
        .filter((src) => LICDN_IMG_RE.test(src)),
    ),
  ];
  return { text, author, imageUrls };
}

function escapeHtml(t: string): string {
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

type RenderText = NonNullable<SourceAdapterContext['renderText']>;

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
    const render = ctx.renderText;

    const titles = config.discovery.targetTitles.length ? config.discovery.targetTitles : [''];
    const jobs: DiscoveryJob[] = [];
    const errors: DiscoveryError[] = [];
    const seen = new Set<string>();
    const ocr = config.discovery.postsImageOcr !== false;
    let searchesOk = 0;
    let ocrUsed = false;

    const isAuthwall = (url: string, text: string): boolean =>
      AUTHWALL_RE.test(url) || (AUTHWALL_RE.test(text.slice(0, 3000)) && !text.includes('/jobs/'));

    const authwallResult = (): DiscoveryResult => ({
      jobs,
      errors: [
        ...errors,
        buildError(
          source.id,
          'Sessão LinkedIn expirada ou ausente — rode `career login linkedin` e tente de novo.',
        ),
      ],
      meta: metaBase(titles.length, searchesOk, jobs.length, jobs.length, jobs.length, start),
    });

    // Passada 1 — busca de jobs /jobs/search por título-alvo.
    for (const title of titles) {
      if (jobs.length >= maxJobs || ctx.signal?.aborted) break;
      const searchUrl =
        `https://www.linkedin.com/jobs/search?f_TPR=r86400` +
        (title ? `&keywords=${encodeURIComponent(title)}` : '');
      let page: Awaited<ReturnType<RenderText>>;
      try {
        page = await render(searchUrl);
      } catch (e) {
        errors.push(buildError(source.id, `busca "${title}": ${String(e).slice(0, 120)}`));
        continue;
      }
      if (isAuthwall(page.url, page.text)) return authwallResult();
      searchesOk++;
      for (const card of parseLinkedInSearchHtml(page.text)) {
        if (jobs.length >= maxJobs || ctx.signal?.aborted) break;
        if (seen.has(card.id)) continue;
        seen.add(card.id);
        if (title && !matchesTargetTitles(card.title, config.discovery.targetTitles)) continue;
        try {
          const detail = await render(card.url);
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

    // Passada 2 — busca de posts que divulgam vagas por título-alvo.
    for (const title of titles) {
      if (jobs.length >= maxJobs || ctx.signal?.aborted) break;
      const query = title
        ? `${title} (vaga OR vagas OR contratando OR hiring)`
        : '(vaga OR contratando OR hiring)';
      const searchUrl =
        `https://www.linkedin.com/search/results/content/?sortBy=date_posted` +
        `&keywords=${encodeURIComponent(query)}`;
      let page: Awaited<ReturnType<RenderText>>;
      try {
        page = await render(searchUrl);
      } catch (e) {
        errors.push(buildError(source.id, `posts "${title}": ${String(e).slice(0, 120)}`));
        continue;
      }
      if (isAuthwall(page.url, page.text)) {
        if (ocrUsed) await disposeOcrWorker().catch(() => {});
        return authwallResult();
      }
      searchesOk++;
      for (const post of parseLinkedInPostsHtml(page.text).slice(0, POSTS_PER_TITLE)) {
        if (jobs.length >= maxJobs || ctx.signal?.aborted) break;
        if (seen.has(post.id)) continue;
        seen.add(post.id);
        try {
          const detail = await render(post.url);
          const { text, author, imageUrls } = parseLinkedInPostDetail(detail.text);
          const body = text || post.snippet;
          if (!body || !POST_JOBISH_RE.test(body)) continue;

          const contacts = extractContacts(body);
          if (!hasAnyContact(contacts) && ocr) {
            for (const img of imageUrls.slice(0, IMAGES_PER_POST)) {
              ocrUsed = true;
              const ocrContacts = extractContacts(await ocrImageUrl(img));
              for (const e of ocrContacts.emails)
                if (!contacts.emails.includes(e)) contacts.emails.push(e);
              for (const p of ocrContacts.phones)
                if (!contacts.phones.includes(p)) contacts.phones.push(p);
              for (const l of ocrContacts.links)
                if (!contacts.links.includes(l)) contacts.links.push(l);
              if (hasAnyContact(contacts)) break;
            }
          }

          const url = applyLinkOf(contacts) ?? post.url;
          const titleLine = body.split(/\n|\./)[0].trim().slice(0, 90) || 'Post do LinkedIn';
          const contactLines = [
            ...contacts.emails.map((e) => `<p>E-mail de contato: ${escapeHtml(e)}</p>`),
            ...contacts.phones.map((p) => `<p>Telefone de contato: ${escapeHtml(p)}</p>`),
            ...contacts.links.map((l) => `<p>Link de candidatura: ${escapeHtml(l)}</p>`),
          ].join('\n');
          const descriptionHtml = [
            `<p>${escapeHtml(body)}</p>`,
            contactLines,
            `<p>Post: ${escapeHtml(post.url)}</p>`,
            author || post.author ? `<p>Autor: ${escapeHtml(author || post.author)}</p>` : '',
          ]
            .filter(Boolean)
            .join('\n');
          jobs.push(
            rawJobFromNormalized(
              {
                url,
                title: titleLine,
                company: author || post.author,
                location: '',
                descriptionHtml,
              },
              source.name,
              source.id,
            ),
          );
        } catch {
          // render do post falhou — o card seguinte continua
        }
      }
    }

    if (ocrUsed) await disposeOcrWorker().catch(() => {});
    return {
      jobs,
      errors,
      meta: metaBase(titles.length, searchesOk, jobs.length, jobs.length, jobs.length, start),
    };
  },
};
