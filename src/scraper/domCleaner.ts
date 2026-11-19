import { parse } from 'node-html-parser';
import TurndownService from 'turndown';

export interface CleanJobDocument {
  markdown: string;
  title?: string;
  company?: string;
}

const STRIP_TAGS = [
  'script',
  'style',
  'svg',
  'nav',
  'footer',
  'aside',
  'noscript',
  'iframe',
  'form',
  'link',
];

/** Seletores que sinalizam o container principal da descrição da vaga. */
const MAIN_HINTS = /job|description|descricao|conteudo|content|posting|vacanc|descriptionbody/i;
const MAIN_SELECTORS = [
  'main',
  '[id*="job"]',
  '[id*="description"]',
  '[class*="job-description"]',
  '[class*="posting"]',
  '[class*="description"]',
  'article',
];

/**
 * Limpeza agressiva de contexto (doc 03 §5.1): remove boilerplate e converte só
 * o conteúdo principal em Markdown compacto. Página média 18k → ~900 tokens.
 */
export function cleanJobHtml(html: string, _url = 'https://localhost/'): CleanJobDocument {
  const root = parse(html);

  for (const tag of STRIP_TAGS) {
    root.querySelectorAll(tag).forEach((el) => el.remove());
  }

  const main = findMainContainer(root);
  const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
  const markdown = turndown
    .turndown(main.innerHTML)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  return {
    markdown,
    title: root.querySelector('h1')?.text.trim() || undefined,
    company: extractCompany(root),
  };
}

/** Heurística de readability: prefere <main> ou container cujo id/classe sugira a descrição. */
function findMainContainer(root: ReturnType<typeof parse>): { innerHTML: string } {
  for (const sel of MAIN_SELECTORS) {
    const el = root.querySelector(sel);
    if (el && el.text.trim().length > 50) return { innerHTML: el.innerHTML };
  }

  // Fallback: maior bloco textual por id/classe com hint de descrição
  let best: { innerHTML: string } | null = null;
  let bestLen = 0;
  for (const el of root.querySelectorAll('div, section, article')) {
    const marker = `${el.getAttribute('id') ?? ''} ${el.getAttribute('class') ?? ''}`;
    const len = el.text.trim().length;
    if (MAIN_HINTS.test(marker) && len > bestLen) {
      best = { innerHTML: el.innerHTML };
      bestLen = len;
    }
  }
  return best ?? { innerHTML: root.querySelector('body')?.innerHTML ?? root.innerHTML };
}

function extractCompany(root: ReturnType<typeof parse>): string | undefined {
  const ogSite = root.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
  if (ogSite?.trim()) return ogSite.trim();
  const header = root.querySelector('header')?.text.replace(/\s+/g, ' ').trim();
  if (header && header.length > 0 && header.length <= 60) return header;
  return root.querySelector('title')?.text.trim() || undefined;
}

/** Estimativa rápida de tokens (~4 chars/token) para orçamento de contexto. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
