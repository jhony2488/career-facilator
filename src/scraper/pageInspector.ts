/// <reference lib="dom" />
import type { Page } from 'playwright';
import type { PageStateLike } from '../autofill/formExecutor';

/** Alias legível — a página real é um PageStateLike com `dom` preenchido. */
export type LivePageState = PageStateLike;

/** Snapshot serializável extraído do DOM (evaluate → JSON). */
export interface PageSnapshot {
  fields: Array<{
    kind: string;
    label: string;
    required: boolean;
    selector: string;
    name: string;
  }>;
  hasCaptcha: boolean;
  requiresEmailOtp: boolean;
  alreadyAppliedBanner: boolean;
  validationErrors: string[];
  currentStep: number;
  totalSteps: number;
  isShadowDom: boolean;
}

/**
 * Função injetada na página — TEM que ser autocontida (evaluate serializa o
 * corpo; nada de referências externas). Marca cada campo com data-cf-idx para
 * gerar seletor estável independente de id/name do framework.
 */
function snapshotScript(): PageSnapshot {
  const SKIP_TYPES = ['hidden', 'submit', 'button', 'image', 'reset', 'password'];
  const isVisible = (el: Element) =>
    !!(el as HTMLElement).offsetWidth ||
    !!(el as HTMLElement).offsetHeight ||
    el.getClientRects().length > 0;

  const labelFor = (el: HTMLElement): string => {
    const id = el.getAttribute('id');
    if (id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      const text = lbl?.textContent?.trim();
      if (text) return text;
    }
    const wrap = el.closest('label');
    const wrapText = wrap?.textContent?.trim();
    if (wrapText) return wrapText;
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const t = document.getElementById(labelledBy);
      if (t?.textContent?.trim()) return t.textContent!.trim();
    }
    return (
      el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') ||
      el.getAttribute('name') ||
      ''
    ).trim();
  };

  const fields: PageSnapshot['fields'] = [];
  let idx = 0;
  for (const el of Array.from(document.querySelectorAll('input,select,textarea'))) {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'input' && SKIP_TYPES.includes(type)) continue;
    // <input type=file> costuma ficar display:none atrás de um label — coleta mesmo invisível
    if (!isVisible(el) && type !== 'file') continue;
    el.setAttribute('data-cf-idx', String(idx++));
    const kind =
      type === 'file'
        ? 'file'
        : tag === 'select'
          ? 'select'
          : tag === 'textarea'
            ? 'textarea'
            : 'input';
    fields.push({
      kind,
      label: labelFor(el as HTMLElement),
      required: (el as HTMLInputElement).required || el.getAttribute('aria-required') === 'true',
      selector: `[data-cf-idx="${idx - 1}"]`,
      name: el.getAttribute('name') || el.getAttribute('id') || '',
    });
  }

  const captchaSel =
    'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare"], .g-recaptcha, .h-captcha, .cf-turnstile, [data-sitekey]';
  const hasCaptcha = Array.from(document.querySelectorAll(captchaSel)).some(isVisible);

  const requiresEmailOtp = !!document.querySelector(
    'input[name*="otp" i], input[name*="code" i], input[id*="otp" i], input[autocomplete="one-time-code"]',
  );

  const bodyText = (document.body?.innerText || '').slice(0, 5000);
  const alreadyAppliedBanner =
    /already applied|you'?ve applied|you have applied|já se candidatou|ja se candidatou|ya has aplicado|candidatura já enviada/i.test(
      bodyText,
    );

  const validationErrors = Array.from(
    document.querySelectorAll(
      '[role="alert"], .invalid-feedback, .field-error, .form-error, .error-message',
    ),
  )
    .filter((e) => isVisible(e) && e.textContent?.trim())
    .map((e) => e.textContent!.trim().slice(0, 140))
    .slice(0, 5);

  const stepMatch = bodyText.match(
    /step\s*(\d+)\s*(?:of|\/)\s*(\d+)|etapa\s*(\d+)\s*(?:de|\/)\s*(\d+)/i,
  );
  const currentStep = stepMatch ? Number(stepMatch[1] ?? stepMatch[3]) : 1;
  const totalSteps = stepMatch ? Number(stepMatch[2] ?? stepMatch[4]) : 1;

  let isShadowDom = false;
  for (const e of Array.from(document.querySelectorAll('body *'))) {
    if (e.shadowRoot) {
      isShadowDom = true;
      break;
    }
  }

  return {
    fields,
    hasCaptcha,
    requiresEmailOtp,
    alreadyAppliedBanner,
    validationErrors,
    currentStep,
    totalSteps,
    isShadowDom,
  };
}

/** Mapeamento puro snapshot → estado — testável sem navegador. */
export function snapshotToState(snap: PageSnapshot, url: string, dom?: unknown): LivePageState {
  return {
    url,
    fields: snap.fields.map((f) => ({ ...f })),
    hasCaptcha: snap.hasCaptcha,
    requiresEmailOtp: snap.requiresEmailOtp,
    validationErrors: [...snap.validationErrors],
    alreadyAppliedBanner: snap.alreadyAppliedBanner,
    currentStep: snap.currentStep,
    totalSteps: snap.totalSteps,
    isShadowDom: snap.isShadowDom,
    submitted: false,
    ...(dom ? { dom } : {}),
  };
}

/** Re-inspect após 'Next' em wizard — atualiza o estado com o DOM corrente. */
export async function inspectDom(page: Page, url?: string): Promise<LivePageState> {
  const snap = await page.evaluate(snapshotScript);
  return snapshotToState(snap, url ?? page.url(), page);
}

/**
 * pageFactory real (feature/06): abre a URL do formulário e devolve o estado
 * vivo. Falha de navegação → quem chama decide (cli cai p/ emptyPage → canal
 * de mensagem como antes).
 */
export async function inspectPage(page: Page, url: string): Promise<LivePageState> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(800); // SPA precisa de um respiro p/ renderizar o form
  return inspectDom(page, url);
}
