import type { Browser, BrowserContext, BrowserType } from 'playwright';
import { pickViewport } from '../utils/humanSim';
import { ensureBrowserRuntimeEnv, loadRuntimeModule } from '../utils/runtimeModules';

/**
 * Browser único por `run` — lançado sob demanda no primeiro formulário web.
 * Com AUTOFILL_PROFILE_DIR usa contexto persistente (reaproveita logins do
 * usuário nos portais — igual ao discovery autenticado).
 * Só o CLI importa este módulo — testes nunca carregam playwright.
 * Import lazy: playwright fica FORA do bundle SEA (requires dinâmicos do
 * playwright-core quebram em single-file) — no exe ele é carregado do runtime
 * sidecar (`career-runtime/node_modules` via loadRuntimeModule); sem runtime
 * o load falha e quem chama cai no fallback de canal de mensagem/
 * NEEDS_HUMAN_INPUT, como antes.
 * Stealth (playwright-extra + puppeteer-extra-plugin-stealth) reduz detecção
 * anti-bot (webdriver flag, chrome.runtime, WebGL, UA-headless…) — prevenção,
 * CAPTCHA continua escalando p/ humano.
 */
let browser: Browser | undefined;
let context: BrowserContext | undefined;
const chromiumPromises = new Map<boolean, Promise<BrowserType>>();

function getChromium(stealth: boolean): Promise<BrowserType> {
  let cached = chromiumPromises.get(stealth);
  if (!cached) {
    cached = (async () => {
      ensureBrowserRuntimeEnv();
      if (stealth) {
        try {
          const [{ chromium }, { default: stealthPlugin }] = await Promise.all([
            loadRuntimeModule<{ chromium: BrowserType & { use(p: unknown): void } }>(
              'playwright-extra',
            ),
            loadRuntimeModule<{ default: () => unknown }>('puppeteer-extra-plugin-stealth'),
          ]);
          chromium.use(stealthPlugin());
          return chromium;
        } catch {
          // plugin indisponível — cai p/ playwright puro (menos stealth, funciona)
        }
      }
      const { chromium } = await loadRuntimeModule<{ chromium: BrowserType }>('playwright');
      return chromium;
    })();
    chromiumPromises.set(stealth, cached);
  }
  return cached;
}

export async function getJobBrowserContext(
  opts: {
    headless?: boolean;
    profileDir?: string;
    stealth?: boolean;
  } = {},
): Promise<BrowserContext> {
  // Cache pode estar morto (closeJobBrowser entre comandos do shell ou crash
  // do Chromium) — probe barato via pages() e relança em vez de falhar no newPage.
  if (context) {
    try {
      context.pages();
      return context;
    } catch {
      context = undefined;
      browser = undefined;
    }
  }
  const chromium = await getChromium(opts.stealth !== false);
  const headless = opts.headless ?? true;
  const viewport = pickViewport();
  const args = ['--disable-blink-features=AutomationControlled'];
  // headless "novo" (channel:'chromium') — Chromium completo sem janela,
  // fingerprint ~headed; fallback p/ headless clássico se o build faltar.
  const withChannel = <T>(launch: (channel?: 'chromium') => Promise<T>): Promise<T> =>
    headless ? launch('chromium').catch(() => launch()) : launch();
  if (opts.profileDir) {
    context = await withChannel((channel) =>
      chromium.launchPersistentContext(opts.profileDir as string, {
        headless,
        viewport,
        args,
        channel,
      }),
    );
  } else {
    const launched = await withChannel((channel) => chromium.launch({ headless, args, channel }));
    browser = launched;
    context = await launched.newContext({ viewport });
  }
  // Sob tsx/esbuild (keepNames) o corpo de funções passadas a evaluate() pode
  // referenciar o helper `__name`, ausente na página — stub identidade no
  // contexto p/ evaluate(serialized-fn) funcionar (pageInspector/humanSim).
  await context.addInitScript({
    content: 'window.__name = function (f) { return f; };',
  });
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
