import type { Page } from 'playwright';
import {
  clickApplyButton,
  hasFormFields,
  inspectDom,
  scanApplyScript,
  type LivePageState,
} from '../scraper/pageInspector';

/**
 * Navegação agêntica (doc 10, decisão #29) — último degrau antes de escalar
 * p/ humano: quando a cadeia determinística não acha o form, um modelo
 * escolhe UMA ação por passo (goto url | click texto | stop) com base na
 * página atual. O agente só NAVEGA — nunca digita nem submete; a chegada
 * é detectada pela inspeção determinística, não pela fala do modelo.
 */

export interface NavAction {
  action: 'goto' | 'click' | 'stop';
  /** URL absoluta (goto) ou texto do botão/link (click). */
  target?: string;
}

export interface NavContext {
  url: string;
  title: string;
  anchors: { text: string; href: string }[];
  hasButton: boolean;
}

const MAX_STEPS = 8;
const STEP_TIMEOUT_MS = 120_000;

async function inspectWithLazy(page: Page): Promise<LivePageState | null> {
  let state = await inspectDom(page).catch(() => null);
  if (state && !hasFormFields(state)) {
    // Widget/iframe lazy — respiro p/ montar e 1 re-inspect.
    await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
    state = await inspectDom(page).catch(() => null);
  }
  return state;
}

/**
 * Loop decide→executa→inspeciona. Devolve o estado com form ou null
 * (mesmo NEEDS_HUMAN_INPUT de sempre — ganho puro, sem risco de submit).
 */
export async function agentNavigateToForm(
  page: Page,
  opts: {
    decide: (ctx: NavContext) => Promise<NavAction | null>;
    /** URL da vaga original — contexto do prompt + anti-loop. */
    originUrl?: string;
    maxSteps?: number;
    onStep?: (msg: string) => void;
  },
): Promise<LivePageState | null> {
  const maxSteps = opts.maxSteps ?? MAX_STEPS;
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  const visited = new Set<string>([page.url()]);
  for (let step = 0; step < maxSteps && Date.now() < deadline; step++) {
    let scan;
    let title: string;
    try {
      [scan, title] = await Promise.all([
        page.evaluate(scanApplyScript),
        page.title().catch(() => ''),
      ]);
    } catch {
      return null; // página morta — popup fechado, navegação race, etc.
    }
    const ctx: NavContext = {
      url: page.url(),
      title,
      anchors: scan.anchors.slice(0, 40),
      hasButton: scan.hasButton,
    };
    const act = await opts.decide(ctx).catch(() => null);
    if (!act || act.action === 'stop') {
      const state = await inspectWithLazy(page);
      return hasFormFields(state) ? state : null;
    }
    let moved = false;
    if (act.action === 'goto' && /^https?:\/\//i.test(act.target ?? '')) {
      opts.onStep?.(`→ ${act.target}`);
      await page
        .goto(act.target as string, { waitUntil: 'domcontentloaded', timeout: 15_000 })
        .catch(() => {});
      moved = true;
    } else if (act.action === 'click' && act.target?.trim()) {
      opts.onStep?.(`→ click "${act.target.slice(0, 60)}"`);
      const winner = await clickApplyButton(page, act.target.trim());
      if (winner && winner !== page) {
        await page.close().catch(() => {}); // popup assumiu — solta a aba velha
      }
      if (winner) {
        page = winner;
        moved = true;
      }
    }
    if (!moved) return null;
    const state = await inspectWithLazy(page);
    if (hasFormFields(state)) return state;
    if (visited.has(page.url())) return null; // loop — ação não saiu do lugar
    visited.add(page.url());
  }
  return null;
}
