import {
  linkedinAdapter,
  parseLinkedInSearchHtml,
} from '../../../src/discovery/adapters/linkedinAdapter';
import { sourceById } from '../../../src/discovery/registry';
import { makeConfig } from '../../helpers/factories';
import type { Fetcher } from '../../../src/discovery/types';

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
