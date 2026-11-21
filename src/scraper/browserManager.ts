import type { Browser, BrowserContext } from 'playwright';

/**
 * Browser único por `run` — lançado sob demanda no primeiro formulário web.
 * Com AUTOFILL_PROFILE_DIR usa contexto persistente (reaproveita logins do
 * usuário nos portais — igual ao discovery autenticado).
 * Só o CLI importa este módulo — testes nunca carregam playwright.
 * Import lazy: playwright fica FORA do bundle SEA (requires dinâmicos do
 * playwright-core quebram em single-file) — no exe o import falha e quem
 * chama cai no fallback de canal de mensagem/NEEDS_HUMAN_INPUT.
 */
let browser: Browser | undefined;
let context: BrowserContext | undefined;

export async function getJobBrowserContext(
  opts: {
    headless?: boolean;
    profileDir?: string;
  } = {},
): Promise<BrowserContext> {
  if (context) return context;
  const { chromium } = await import('playwright');
  const headless = opts.headless ?? true;
  if (opts.profileDir) {
    context = await chromium.launchPersistentContext(opts.profileDir, {
      headless,
      viewport: { width: 1280, height: 800 },
    });
  } else {
    browser = await chromium.launch({ headless });
    context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  }
  return context;
}

export async function closeJobBrowser(): Promise<void> {
  try {
    await context?.close();
    if (browser && browser !== (context?.browser() ?? undefined)) await browser.close();
  } finally {
    context = undefined;
    browser = undefined;
  }
}
