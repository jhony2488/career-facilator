import {
  linkedinAdapter,
  parseLinkedInSearchHtml,
  parseLinkedInPostsHtml,
  parseLinkedInPostDetail,
} from '../../../src/discovery/adapters/linkedinAdapter';
import { sourceById } from '../../../src/discovery/registry';
import { makeConfig } from '../../helpers/factories';
import type { Fetcher, SourceAdapterContext } from '../../../src/discovery/types';

jest.mock('../../../src/discovery/imageOcr', () => ({
  ocrImageUrl: jest.fn(async (url: string) =>
    url.includes('banner') ? 'vaga backend — cv p/ rh@acme.com' : '',
  ),
  disposeOcrWorker: jest.fn(async () => {}),
}));
import { ocrImageUrl } from '../../../src/discovery/imageOcr';

const SEARCH_HTML = `
<ul class="jobs-search__results-list">
  <li>
    <div class="base-card">
      <a href="https://www.linkedin.com/jobs/view/backend-developer-at-acme-4242424200">
        <span class="base-search-card__title">Backend Developer</span>
      </a>
      <a class="base-search-card__subtitle" href="/company/acme">Acme Corp</a>
      <span class="job-search-card__location">São Paulo, Brazil</span>
    </div>
  </li>
  <li>
    <div class="base-card">
      <a href="https://www.linkedin.com/jobs/view/barista-4242424300">
        <span class="base-search-card__title">Barista senior</span>
      </a>
    </div>
  </li>
</ul>`;

const fetcher: Fetcher = {
  fetchText: jest.fn(async () => ({ url: '', text: '', status: 200 })),
  fetchJson: (async <T = unknown>() => ({
    url: '',
    data: null as T,
    status: 200,
  })) as Fetcher['fetchJson'],
};

describe('parseLinkedInSearchHtml', () => {
  // feature/01: "apenas os cards de vagas dentro dos critérios são extraídos"
  it('extracts job cards with id, title, company and location', () => {
    const cards = parseLinkedInSearchHtml(SEARCH_HTML);

    expect(cards).toHaveLength(2);
    expect(cards[0].id).toBe('4242424200');
    expect(cards[0].title).toBe('Backend Developer');
    expect(cards[0].company).toBe('Acme Corp');
    expect(cards[0].location).toContain('São Paulo');
    expect(cards[0].url).toBe('https://www.linkedin.com/jobs/view/4242424200');
  });
});

describe('linkedinAdapter', () => {
  it('errors without a browser session (renderText)', async () => {
    const result = await linkedinAdapter.discover({
      config: makeConfig(),
      source: sourceById('linkedin')!,
      fetcher,
      maxJobs: 10,
    });

    expect(result.jobs).toHaveLength(0);
    expect(result.errors[0].message).toContain('career login linkedin');
  });

  it('collects matching job cards and renders each detail page', async () => {
    const config = makeConfig();
    config.discovery.targetTitles = ['Backend Developer'];
    const rendered: string[] = [];
    const renderText = async (url: string) => {
      rendered.push(url);
      if (url.includes('/jobs/search')) return { url, text: SEARCH_HTML, status: 200 };
      return { url, text: '<html><body>Job description API work</body></html>', status: 200 };
    };

    const result = await linkedinAdapter.discover({
      config,
      source: sourceById('linkedin')!,
      fetcher,
      renderText,
      maxJobs: 10,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].raw.url).toBe('https://www.linkedin.com/jobs/view/4242424200');
    expect(result.jobs[0].raw.html).toContain('Backend Developer');
    expect(rendered.some((u) => u.includes('keywords=Backend%20Developer'))).toBe(true);
  });

  it('flags an expired session when the search hits the authwall', async () => {
    const result = await linkedinAdapter.discover({
      config: makeConfig(),
      source: sourceById('linkedin')!,
      fetcher,
      renderText: async () => ({
        url: 'https://www.linkedin.com/authwall',
        text: '<html>Sign in to continue</html>',
        status: 200,
      }),
      maxJobs: 10,
    });

    expect(result.jobs).toHaveLength(0);
    expect(result.errors[0].message).toContain('Sessão LinkedIn expirada');
  });
});

const POSTS_SEARCH_HTML = `
<div class="feed-shared-update-v2">
  <a href="https://www.linkedin.com/feed/update/urn:li:activity:7300123456789012345">1d</a>
  <span class="update-components-text">Estamos contratando! Vaga de Backend Developer…</span>
  <span class="update-components-actor__name">Recruiter Ana</span>
</div>
<div class="feed-shared-update-v2">
  <a href="https://www.linkedin.com/posts/some-post-activity-7300123456789000999">2d</a>
</div>`;

const POST_DETAIL_HTML = `<html><body>
  <div class="update-components-text">Estamos contratando! Vaga de Backend Developer remoto.
  Envie currículo para rh@acme.com ou chama no telefone +55 81 99988-7766</div>
  <span class="update-components-actor__name">Recruiter Ana</span>
  <img src="https://media.licdn.com/dms/image/banner.png">
</body></html>`;

describe('parseLinkedInPostsHtml / parseLinkedInPostDetail', () => {
  it('extracts post links, ids, snippets and author', () => {
    const posts = parseLinkedInPostsHtml(POSTS_SEARCH_HTML);

    expect(posts).toHaveLength(2);
    expect(posts[0].id).toBe('7300123456789012345');
    expect(posts[0].url).toBe(
      'https://www.linkedin.com/feed/update/urn:li:activity:7300123456789012345',
    );
    expect(posts[0].snippet).toContain('Backend Developer');
    expect(posts[0].author).toBe('Recruiter Ana');
  });

  it('extracts full text, author and licdn image urls from a post page', () => {
    const d = parseLinkedInPostDetail(POST_DETAIL_HTML);

    expect(d.text).toContain('rh@acme.com');
    expect(d.author).toBe('Recruiter Ana');
    expect(d.imageUrls).toEqual(['https://media.licdn.com/dms/image/banner.png']);
  });
});

describe('linkedinAdapter posts pass', () => {
  const renderPostsFlow = (opts: { detailHtml?: string } = {}) => {
    const rendered: string[] = [];
    const renderText = async (url: string) => {
      rendered.push(url);
      if (url.includes('/jobs/search')) return { url, text: '<html></html>', status: 200 };
      if (url.includes('/search/results/content'))
        return { url, text: POSTS_SEARCH_HTML, status: 200 };
      return { url, text: opts.detailHtml ?? POST_DETAIL_HTML, status: 200 };
    };
    return { rendered, renderText };
  };

  // feature/01: posts divulgam vagas — contatos do texto viram canais reais
  it('collects a hiring post and embeds email/phone as application channels', async () => {
    const config = makeConfig();
    config.discovery.targetTitles = ['Backend Developer'];
    const { rendered, renderText } = renderPostsFlow();

    const result = await linkedinAdapter.discover({
      config,
      source: sourceById('linkedin')!,
      fetcher,
      renderText,
      maxJobs: 10,
    });

    expect(result.errors).toHaveLength(0);
    const postJob = result.jobs.find((j) => j.raw.html.includes('Estamos contratando'));
    expect(postJob).toBeDefined();
    expect(postJob!.raw.html).toContain('rh@acme.com');
    expect(postJob!.raw.html).toContain('Telefone de contato:');
    expect(postJob!.raw.html).toContain('Post: https://www.linkedin.com/feed/update/');
    expect(rendered.some((u) => u.includes('results/content'))).toBe(true);
    expect(ocrImageUrl).not.toHaveBeenCalled();
  });

  // imagem sem contato no texto → OCR lê o binário procurando canal
  it('falls back to OCR on post images when the text has no contact', async () => {
    const config = makeConfig();
    config.discovery.targetTitles = ['Backend Developer'];
    const noContactDetail = `<html><body>
      <div class="update-components-text">Estamos contratando! Vaga de Backend Developer, veja o banner.</div>
      <img src="https://media.licdn.com/dms/image/banner.png">
    </body></html>`;
    const { renderText } = renderPostsFlow({ detailHtml: noContactDetail });

    const result = await linkedinAdapter.discover({
      config,
      source: sourceById('linkedin')!,
      fetcher,
      renderText,
      maxJobs: 10,
    });

    expect(ocrImageUrl).toHaveBeenCalledWith('https://media.licdn.com/dms/image/banner.png');
    const postJob = result.jobs.find((j) => j.raw.html.includes('Estamos contratando'));
    expect(postJob!.raw.html).toContain('rh@acme.com');
  });

  // post de vaga sem canal nenhum → ainda entra p/ revisão humana
  it('keeps a job-ish post with no contact at all for human review', async () => {
    const config = makeConfig();
    config.discovery.targetTitles = ['Backend Developer'];
    const noContact = `<html><body>
      <div class="update-components-text">Estamos contratando! Vaga de Backend Developer, detalhes no DM.</div>
    </body></html>`;
    const { renderText } = renderPostsFlow({ detailHtml: noContact });

    const result = await linkedinAdapter.discover({
      config,
      source: sourceById('linkedin')!,
      fetcher,
      renderText,
      maxJobs: 10,
    });

    const postJob = result.jobs.find((j) => j.raw.html.includes('Estamos contratando'));
    expect(postJob).toBeDefined();
    expect(postJob!.raw.url).toContain('urn:li:activity');
  });

  it('skips posts that are not about jobs', async () => {
    const config = makeConfig();
    config.discovery.targetTitles = ['Backend Developer'];
    const offTopic = `<html><body>
      <div class="update-components-text">Almoço de família hoje, sem trabalho envolvido!</div>
    </body></html>`;
    const { renderText } = renderPostsFlow({ detailHtml: offTopic });

    const result = await linkedinAdapter.discover({
      config,
      source: sourceById('linkedin')!,
      fetcher,
      renderText,
      maxJobs: 10,
    });

    expect(result.jobs).toHaveLength(0);
  });

  // Navegação interativa: renderPage recebe `interact` p/ expandir "ver mais"
  it('passes an interact callback to renderPage (see-more expansion) on post pages', async () => {
    const config = makeConfig();
    config.discovery.targetTitles = ['Backend Developer'];
    const interacted: string[] = [];
    const renderPage: SourceAdapterContext['renderPage'] = async (url, opts) => {
      if (opts?.interact) {
        interacted.push(url);
        const fake = {
          evaluate: async () => undefined,
          waitForTimeout: async () => undefined,
        };
        await opts.interact(fake as never);
      }
      if (url.includes('/jobs/search')) return { url, text: '<html></html>', status: 200 };
      if (url.includes('/search/results/content'))
        return { url, text: POSTS_SEARCH_HTML, status: 200 };
      return { url, text: POST_DETAIL_HTML, status: 200 };
    };

    const result = await linkedinAdapter.discover({
      config,
      source: sourceById('linkedin')!,
      fetcher,
      renderPage,
      maxJobs: 10,
    });

    expect(result.jobs.length).toBeGreaterThan(0);
    // feed de conteúdo + página de detalhe do post passam pelo see-more
    expect(interacted.some((u) => u.includes('/search/results/content'))).toBe(true);
    expect(interacted.some((u) => u.includes('linkedin.com/feed/update'))).toBe(true);
  });

  // Encurtador lnkd.in é seguido no browser — URL final vira a candidatura
  it('resolves a lnkd.in short link from a post into the final apply URL', async () => {
    const config = makeConfig();
    config.discovery.targetTitles = ['Backend Developer'];
    const postHtml = `<html><body>
      <div class="update-components-text">Estamos contratando! Vaga de Backend Developer.
      Candidate-se aqui: https://lnkd.in/xyzabc123</div>
    </body></html>`;
    const renderText = async (url: string) => {
      if (url.includes('/jobs/search')) return { url, text: '<html></html>', status: 200 };
      if (url.includes('/search/results/content'))
        return { url, text: POSTS_SEARCH_HTML, status: 200 };
      if (url.includes('lnkd.in')) {
        return {
          url: 'https://boards.greenhouse.io/acme/jobs/99',
          text: '<html></html>',
          status: 200,
        };
      }
      return { url, text: postHtml, status: 200 };
    };

    const result = await linkedinAdapter.discover({
      config,
      source: sourceById('linkedin')!,
      fetcher,
      renderText,
      maxJobs: 10,
    });

    const job = result.jobs.find((j) => j.raw.url.includes('greenhouse.io/acme/jobs/99'));
    expect(job).toBeDefined();
  });

  // Encurtador que resolve p/ listagem LinkedIn é descartado (fica o post)
  it('keeps the post url when the short link resolves to a LinkedIn listing', async () => {
    const config = makeConfig();
    config.discovery.targetTitles = ['Backend Developer'];
    const postHtml = `<html><body>
      <div class="update-components-text">Estamos contratando! Vaga de Backend Developer.
      Veja todas: https://lnkd.in/listing456</div>
    </body></html>`;
    const renderText = async (url: string) => {
      if (url.includes('/jobs/search')) return { url, text: '<html></html>', status: 200 };
      if (url.includes('/search/results/content'))
        return { url, text: POSTS_SEARCH_HTML, status: 200 };
      if (url.includes('lnkd.in')) {
        return {
          url: 'https://br.linkedin.com/jobs/desenvolvedor-vagas',
          text: '<html></html>',
          status: 200,
        };
      }
      return { url, text: postHtml, status: 200 };
    };

    const result = await linkedinAdapter.discover({
      config,
      source: sourceById('linkedin')!,
      fetcher,
      renderText,
      maxJobs: 10,
    });

    // o encurtador → listagem LinkedIn é descartado; ficam as URLs dos posts
    expect(result.jobs.length).toBeGreaterThan(0);
    expect(result.jobs.every((j) => /linkedin\.com\/(feed\/update|posts)\//.test(j.raw.url))).toBe(
      true,
    );
  });
});
