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
        required: (el as HTMLInputElement).required || el.getAttribute('aria-required') === 'true',
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
    ...(snap.dropzones?.length ? { dropzones: snap.dropzones.map((d) => ({ ...d })) } : {}),
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

/** Hosts de ATS conhecidos — link pra eles é quase certamente o form real. */
const ATS_HOST_RE =
  /greenhouse|lever\.co|ashbyhq|workable|workday|myworkday|gupy|smartrecruiters|breezy\.hr|recruitee|personio|teamtailor|rippling|icims|jobvite|taleo|eightfold|successfactors|bamboohr|pinpoint|join\.com/i;

/** Texto de link/botão de candidatura (EN/PT/ES/DE/FR/NL/PL/nórdicos) — curto p/ ser CTA. */
const APPLY_TEXT_RE =
  /\bapply\b|apply now|apply for|apply online|candidat|inscrev|inscri[çc][ãa]o|quero me candidatar|aplicar\b|postular|postuler|bewerb|sollicit|aplikuj|ansok|ans[øo][gk]|s[øo]k|trabalhe|enviar curr[ií]culo/i;

/**
 * Path que é destino de candidatura por definição — cobre links com texto
 * genérico ("company portal", "view job") apontando p/ /apply, /bewerben…
 */
const APPLY_PATH_RE =
  /\/(apply|apply-now|application|candidat|postul|inscri|aplica|bewerb|vacature|sollicit|aplikuj|ansok|ans[øo][gk]|trabalhe|job-apply|jobs\/apply|submit-application|enviar-curriculo|register-candidate)([/?#-]|$)/i;

const SKIP_HREF_RE = /^(javascript:|#|mailto:|tel:)/i;

/**
 * Escolhe o destino de candidatura numa página de vaga sem formulário.
 * Puro/testável: `candidates` vem do evaluate; retorna URL absoluta http(s)
 * ou null. Link pra host de ATS conhecido ganha mesmo com texto genérico.
 */
export function pickApplyTarget(
  candidates: Array<{ text: string; href: string }>,
  baseUrl: string,
): string | null {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }
  let atsHit: string | null = null;
  let pathHit: string | null = null;
  let textHit: string | null = null;
  for (const c of candidates) {
    const href = c.href.trim();
    if (!href || SKIP_HREF_RE.test(href)) continue;
    let u: URL;
    try {
      u = new URL(href, base);
    } catch {
      continue;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
    if (u.href === base.href) continue; // self-loop
    const abs = u.href;
    if (ATS_HOST_RE.test(u.hostname)) {
      if (!atsHit) atsHit = abs;
      continue;
    }
    if (APPLY_PATH_RE.test(u.pathname)) {
      if (!pathHit) pathHit = abs;
      continue;
    }
    const text = c.text.trim();
    if (text && text.length <= 80 && APPLY_TEXT_RE.test(text)) {
      if (!textHit) textHit = abs;
    }
  }
  return atsHit ?? pathHit ?? textHit;
}

/**
 * Página de vaga sem form visível: procura link/botão "Apply/Candidate-se",
 * navega 1 hop e re-inspeciona. Retorna o estado da página de destino se ela
 * tiver campos — senão null (fluxo segue p/ canal de mensagem, como antes).
 * Cobre href direto e botão que abre popup/target=_blank.
 */
export async function followApplyLink(page: Page): Promise<LivePageState | null> {
  const found = await page
    .evaluate(() => {
      const out: { anchors: { text: string; href: string }[]; hasButton: boolean } = {
        anchors: [],
        hasButton: false,
      };
      const RE =
        /\bapply\b|apply now|apply for|apply online|candidat|inscrev|inscri[çc][ãa]o|quero me candidatar|aplicar\b|postular|postuler|bewerb|sollicit|aplikuj|ansok|ans[øo][gk]|trabalhe|enviar curr[ií]culo/i;
      // Todas as âncoras (o seletor decide por texto ou por host de ATS).
      for (const el of Array.from(document.querySelectorAll('a[href]')).slice(0, 300)) {
        const href = el.getAttribute('href') ?? '';
        if (!href) continue;
        const t = ((el as HTMLElement).innerText ?? el.textContent ?? '').trim();
        out.anchors.push({ text: t.slice(0, 80), href });
      }
      for (const el of Array.from(
        document.querySelectorAll('button, [role="button"], a:not([href])'),
      )) {
        const t = ((el as HTMLElement).innerText ?? el.textContent ?? '').trim();
        if (t.length <= 80 && RE.test(t)) {
          out.hasButton = true;
          break;
        }
      }
      return out;
    })
    .catch(() => null);
  if (!found) return null;

  const target = pickApplyTarget(found.anchors, page.url());
  try {
    if (target) {
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 });
      let state = await inspectDom(page).catch(() => null);
      // Widget/iframe de candidatura lazy — respiro p/ montar e 1 re-inspect.
      if (state && state.fields.length === 0) {
        await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
        state = await inspectDom(page).catch(() => null);
      }
      return state && state.fields.length ? state : null;
    }
    if (!found.hasButton) return null;
    // Botão JS: pode navegar na mesma aba ou abrir popup — cobre os dois.
    const popup = page
      .context()
      .waitForEvent('page', { timeout: 4000 })
      .catch(() => null);
    const nav = page
      .waitForNavigation({ timeout: 4000 })
      .then(() => page)
      .catch(() => null);
    const btn = page
      .getByRole('button', {
        name: /apply|candidat|aplicar|inscrev|postular|postuler|bewerb|sollicit|aplikuj|ansok|trabalhe/i,
      })
      .first();
    await btn.click({ timeout: 3000 }).catch(() => {});
    const winner = await Promise.race([popup, nav]);
    if (!winner) return null;
    const state = await inspectDom(winner).catch(() => null);
    if (winner !== page) await page.close().catch(() => {});
    return state && state.fields.length ? state : null;
  } catch {
    return null;
  }
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
  let state = await inspectDom(page, url);
  // Widget/iframe de apply tardio (ex.: form embutido da arbeitnow): sem
  // campos no primeiro pass, espera rede acalmar e re-inspeciona uma vez.
  if (state.fields.length === 0) {
    await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
    state = await inspectDom(page, url);
  }
  return state;
}
