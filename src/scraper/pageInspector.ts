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
    /** Índice em page.frames() — carimbado no merge multi-frame. */
    frameIdx?: number;
  }>;
  hasCaptcha: boolean;
  requiresEmailOtp: boolean;
  alreadyAppliedBanner: boolean;
  validationErrors: string[];
  currentStep: number;
  totalSteps: number;
  isShadowDom: boolean;
  /** Zonas de upload sem input[type=file] — selector + frame da zona. */
  dropzones?: Array<{ selector: string; frameIdx?: number }>;
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
    // getRootNode() resolve label/for dentro do shadow root do próprio campo.
    const root = el.getRootNode() as Document | ShadowRoot;
    const id = el.getAttribute('id');
    if (id) {
      const lbl = root.querySelector(`label[for="${CSS.escape(id)}"]`);
      const text = lbl?.textContent?.trim();
      if (text) return text;
    }
    const wrap = el.closest('label');
    const wrapText = wrap?.textContent?.trim();
    if (wrapText) return wrapText;
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const t = root.getElementById?.(labelledBy);
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
  let isShadowDom = false;

  // Campos dentro de shadow roots ABERTOS também são coletados (Workday/Gupy —
  // feature/06 "estruturas encapsuladas"). Roots fechados são opacos por design.
  const collectFields = (root: Document | ShadowRoot) => {
    for (const el of Array.from(root.querySelectorAll('input,select,textarea'))) {
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
        required:
          (el as HTMLInputElement).required || el.getAttribute('aria-required') === 'true',
        selector: `[data-cf-idx="${idx - 1}"]`,
        name: el.getAttribute('name') || el.getAttribute('id') || '',
      });
    }
    for (const e of Array.from(root.querySelectorAll('*'))) {
      if ((e as Element).shadowRoot) {
        isShadowDom = true;
        collectFields((e as Element).shadowRoot!);
      }
    }
  };
  collectFields(document);

  // Dropzones sem input[type=file] real — fallback de upload via eventos drop.
  const dropzones: NonNullable<PageSnapshot['dropzones']> = [];
  let dzIdx = 0;
  const dzSigRe = /drop|upload|anexo|attach|resume|curr[ií]culo|\bcv\b/i;
  const dzTextRe = /arraste|solte|drag|drop|upload|anexar|attach|browse|choose file|arquivo/i;
  const collectDropzones = (root: Document | ShadowRoot) => {
    // Ordem reversa: os mais profundos primeiro — o check abaixo pula
    // containers quando uma zona interna já foi marcada.
    for (const el of Array.from(
      root.querySelectorAll('div,section,label,button,[data-testid]'),
    ).reverse()) {
      if (dropzones.length >= 3) return;
      const he = el as HTMLElement;
      if (!isVisible(he) || he.querySelector('input[type="file"]')) continue;
      const sig = `${he.getAttribute('class') ?? ''} ${he.id ?? ''} ${he.getAttribute('data-testid') ?? ''}`;
      const text = (he.innerText ?? '').trim().slice(0, 160);
      if (!dzSigRe.test(sig) && !(text.length <= 120 && dzTextRe.test(text))) continue;
      // só a zona mais interna — evita marcar container e filho ao mesmo tempo
      if (he.querySelector('[data-cf-dz]')) continue;
      he.setAttribute('data-cf-dz', String(dzIdx));
      dropzones.push({ selector: `[data-cf-dz="${dzIdx++}"]` });
    }
    for (const e of Array.from(root.querySelectorAll('*'))) {
      if ((e as Element).shadowRoot) collectDropzones((e as Element).shadowRoot!);
    }
  };
  collectDropzones(document);

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

  return {
    fields,
    hasCaptcha,
    requiresEmailOtp,
    alreadyAppliedBanner,
    validationErrors,
    currentStep,
    totalSteps,
    isShadowDom,
    dropzones,
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
    ...(snap.dropzones?.length
      ? { dropzones: snap.dropzones.map((d) => ({ ...d })) }
      : {}),
    ...(dom ? { dom } : {}),
  };
}

/**
 * Merge puro de snapshots por frame (testável sem browser): carimba frameIdx
 * nos campos/dropzones, OR nos sinais, concatena erros (cap 5) e usa os
 * contadores de etapa do frame principal.
 */
export function mergeSnapshots(
  snaps: Array<{ frameIdx: number; snap: PageSnapshot }>,
): PageSnapshot {
  const main = snaps.find((s) => s.frameIdx === 0)?.snap ?? snaps[0]?.snap;
  const merged: PageSnapshot = {
    fields: [],
    hasCaptcha: false,
    requiresEmailOtp: false,
    alreadyAppliedBanner: false,
    validationErrors: [],
    currentStep: main?.currentStep ?? 1,
    totalSteps: main?.totalSteps ?? 1,
    isShadowDom: false,
    dropzones: [],
  };
  for (const { frameIdx, snap } of snaps) {
    for (const f of snap.fields) merged.fields.push({ ...f, frameIdx });
    merged.hasCaptcha ||= snap.hasCaptcha;
    merged.requiresEmailOtp ||= snap.requiresEmailOtp;
    merged.alreadyAppliedBanner ||= snap.alreadyAppliedBanner;
    merged.isShadowDom ||= snap.isShadowDom;
    for (const err of snap.validationErrors) {
      if (merged.validationErrors.length < 5 && !merged.validationErrors.includes(err)) {
        merged.validationErrors.push(err);
      }
    }
    for (const dz of snap.dropzones ?? []) merged.dropzones!.push({ ...dz, frameIdx });
  }
  return merged;
}

/**
 * Re-inspect após 'Next' em wizard — atualiza o estado com o DOM corrente.
 * Roda o snapshot em TODOS os frames (evaluate por frame atravessa
 * cross-origin); frame que falhar (detached/navegação) é ignorado.
 */
export async function inspectDom(page: Page, url?: string): Promise<LivePageState> {
  const frames = page.frames();
  const snaps: Array<{ frameIdx: number; snap: PageSnapshot }> = [];
  for (let i = 0; i < frames.length; i++) {
    const snap = await frames[i].evaluate(snapshotScript).catch(() => null);
    if (snap) snaps.push({ frameIdx: i, snap });
  }
  if (snaps.length === 0) {
    return snapshotToState(
      {
        fields: [],
        hasCaptcha: false,
        requiresEmailOtp: false,
        alreadyAppliedBanner: false,
        validationErrors: [],
        currentStep: 1,
        totalSteps: 1,
        isShadowDom: false,
      },
      url ?? page.url(),
      page,
    );
  }
  return snapshotToState(mergeSnapshots(snaps), url ?? page.url(), page);
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
