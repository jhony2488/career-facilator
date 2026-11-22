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
  /** Tela de login/auth do portal — bloqueia a candidatura até o usuário logar. */
  requiresLogin: boolean;
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

  // Muro de login: URL de auth OU senha visível + formulário curto (criar-conta
  // de ATS tem vários campos — senha sozinha não basta p/ chamar de wall).
  const passwordVisible = Array.from(document.querySelectorAll('input[type="password"]')).some(
    isVisible,
  );
  const requiresLogin =
    /login|signin|sign-in|sign_in|entrar|acesso|auth|signup|register|cadastro/i.test(
      location.pathname,
    ) ||
    (passwordVisible && fields.length <= 5);

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
    requiresLogin,
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
    requiresLogin: snap.requiresLogin,
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
    requiresLogin: false,
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
    merged.requiresLogin ||= snap.requiresLogin;
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
  /\/(apply|apply-now|application|candidat|postul|postuler|inscri|aplica|bewerb|vacature|sollicit|aplikuj|ansok|ans[øo][gk]|trabalhe|job-apply|jobs\/apply|submit-application|enviar-curriculo|register-candidate)([/?#-]|$)/i;

const SKIP_HREF_RE = /^(javascript:|#|mailto:|tel:)/i;

/** Path de vaga específica num listing de ATS/portal — deep-link, não página do quadro. */
const JOB_PATH_RE =
  /\/(jobs?|position|opening|vacature|oferta|empleo|vaga|stelle|offre|career|opportunity|requisition|req|posting)\/[\w-]{2,}/i;

const TOKEN_STOP = new Set([
  'job',
  'jobs',
  'career',
  'careers',
  'the',
  'and',
  'de',
  'da',
  'do',
  'en',
  'for',
  'a',
  'e',
  'o',
  'of',
  'in',
  'at',
  'com',
  'www',
]);

/** Tokens do slug da URL (path+host) — base p/ achar a vaga exata num listing. */
function slugTokens(url: string): Set<string> {
  try {
    const u = new URL(url);
    const text = `${u.hostname} ${u.pathname}`.toLowerCase();
    return new Set(text.split(/[^\wÀ-ÿ]+/).filter((t) => t.length >= 3 && !TOKEN_STOP.has(t)));
  } catch {
    return new Set();
  }
}

/**
 * Listing de vagas (página do quadro ATS/portal): escolhe o link da vaga
 * EXATA por overlap de tokens com o slug da URL original — score ≥ 2, ou
 * único candidato. `null` em empate/zero score — não arrisca vaga errada.
 */
export function pickJobLink(
  anchors: { text: string; href: string }[],
  baseUrl: string,
  originUrl: string,
): string | null {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }
  const origin = slugTokens(originUrl);
  const seen = new Set<string>();
  let best: { href: string; score: number } | null = null;
  let candidates = 0;
  for (const c of anchors) {
    const href = c.href.trim();
    if (!href || SKIP_HREF_RE.test(href)) continue;
    let u: URL;
    try {
      u = new URL(href, base);
    } catch {
      continue;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
    if (u.href === base.href || seen.has(u.href)) continue;
    if (!JOB_PATH_RE.test(u.pathname)) continue;
    seen.add(u.href);
    candidates++;
    let score = 0;
    const hay = `${c.text} ${u.pathname}`.toLowerCase();
    for (const tok of origin) if (tok.length >= 4 && hay.includes(tok)) score++;
    if (!best || score > best.score) best = { href: u.href, score };
  }
  if (!best) return null;
  if (best.score >= 2 || candidates === 1) return best.href;
  return null;
}

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

export interface ApplyScan {
  anchors: { text: string; href: string }[];
  hasButton: boolean;
  email?: string;
}

/** Scan serializable — roda igual em page.evaluate e frame.evaluate (iframe). */
export function scanApplyScript(): ApplyScan {
  const out: ApplyScan = { anchors: [], hasButton: false };
  const RE =
    /\bapply\b|apply now|apply for|apply online|candidat|inscrev|inscri[çc][ãa]o|quero me candidatar|aplicar\b|postular|postuler|bewerb|sollicit|aplikuj|ansok|ans[øo][gk]|trabalhe|enviar curr[ií]culo|ver oferta|ver vaga|ver empleo|ver detalle|job details|view job|ver m[aá]s|detalhes/i;
  // Todas as âncoras (o seletor decide por texto ou por host de ATS).
  for (const el of Array.from(document.querySelectorAll('a[href]')).slice(0, 300)) {
    const href = el.getAttribute('href') ?? '';
    if (!href) continue;
    const t = ((el as HTMLElement).innerText ?? el.textContent ?? '').trim();
    out.anchors.push({ text: t.slice(0, 80), href });
  }
  // Clickables de candidatura — além de button/role, cobre a[javascript:],
  // a[#], elementos con onclick y divs/span com clase/id "apply" (remoteok,
  // jobicy, wwr usam div JS pra "Apply this job").
  for (const el of Array.from(
    document.querySelectorAll(
      'button, [role="button"], a, [onclick], input[type="button"], ' +
        'input[type="submit"], [class*="apply" i], [id*="apply" i], [data-testid*="apply" i]',
    ),
  )) {
    const t = ((el as HTMLElement).innerText ?? el.textContent ?? '').trim();
    if (t.length <= 80 && RE.test(t)) {
      out.hasButton = true;
      break;
    }
  }
  // Contacto revelado en la página (mailto:) — el reteste lo reporta.
  const mail = Array.from(document.querySelectorAll('a[href^="mailto:"]'))
    .map((a) =>
      (a.getAttribute('href') ?? '')
        .replace(/^mailto:/i, '')
        .split('?')[0]
        .trim(),
    )
    .find((m) => m.includes('@'));
  if (mail) out.email = mail;
  return out;
}

/** "Chegou no form" = campos ou zona de upload de CV detectável. */
export function hasFormFields(state: LivePageState | null): boolean {
  return !!state && (state.fields.length > 0 || (state.dropzones?.length ?? 0) > 0);
}

const CLICK_FALLBACK_RE =
  /apply|candidat|aplicar|inscrev|postular|postuler|bewerb|sollicit|aplikuj|ansok|trabalhe|ver oferta|ver vaga|ver empleo|job details|view job|detalhes|ver detalle|ver m[aá]s/i;

const CLICKABLE_SEL =
  'button, [role="button"], a, [onclick], input[type="button"], ' +
  'input[type="submit"], [class*="apply" i], [id*="apply" i], [data-testid*="apply" i]';

/**
 * Clica o primeiro elemento de candidatura visível e espera navegação na
 * aba ou popup (retorna a página "vencedora"). `text` (agente) casa por
 * substring literal; sem `text`, usa `CLICK_FALLBACK_RE`.
 */
export async function clickApplyButton(page: Page, text?: string): Promise<Page | null> {
  const popup = page
    .context()
    .waitForEvent('page', { timeout: 6000 })
    .catch(() => null);
  const nav = page
    .waitForNavigation({ timeout: 6000 })
    .then(() => page)
    .catch(() => null);
  const candidates = text
    ? [
        page.getByRole('button', { name: text }).first(),
        page.getByRole('link', { name: text }).first(),
        page.locator(CLICKABLE_SEL).filter({ hasText: text }).first(),
      ]
    : [
        page.getByRole('button', { name: CLICK_FALLBACK_RE }).first(),
        page.getByRole('link', { name: CLICK_FALLBACK_RE }).first(),
        page.locator(CLICKABLE_SEL).filter({ hasText: CLICK_FALLBACK_RE }).first(),
        // Botón dentro de iframe — locator del doc principal no lo alcanza.
        ...page
          .frames()
          .filter((f) => f !== page.mainFrame())
          .slice(0, 6)
          .map((fr) => fr.locator(CLICKABLE_SEL).filter({ hasText: CLICK_FALLBACK_RE }).first()),
      ];
  for (const c of candidates) {
    try {
      if ((await c.count()) > 0 && (await c.isVisible())) {
        await c.click({ timeout: 3000 }).catch(() => {});
        return (await Promise.race([popup, nav])) ?? page;
      }
    } catch {
      // selector inválido/elemento desaparecido — probá o próximo
    }
  }
  return null;
}

/** Un hop: link directo, link de vaga no listing, o botón JS (popup/aba). */
async function applyHop(
  page: Page,
  originUrl: string,
): Promise<{ page: Page; state: LivePageState | null; moved: boolean; email?: string }> {
  let found = await page.evaluate(scanApplyScript).catch(() => null);
  if (!found) return { page, state: null, moved: false };

  let target = pickApplyTarget(found.anchors, page.url());
  // Botão/link dentro de IFRAME — o scan do doc principal não enxerga.
  if (!target && !found.hasButton) {
    for (const fr of page
      .frames()
      .filter((f) => f !== page.mainFrame())
      .slice(0, 6)) {
      const ff = await fr.evaluate(scanApplyScript).catch(() => null);
      if (!ff) continue;
      if (!found.email && ff.email) found.email = ff.email;
      const ft = pickApplyTarget(ff.anchors ?? [], fr.url());
      if (ft || ff.hasButton) {
        found = { anchors: ff.anchors, hasButton: ff.hasButton, email: found.email };
        target = ft;
        break;
      }
    }
  }
  // Listing de vagas sem CTA genérico: escolhe a vaga EXATA por slug da URL
  // original — nunca pega âncora de vaga aleatória (arriscaria aplicação errada).
  if (!target && !found.hasButton) {
    target = pickJobLink(found.anchors ?? [], page.url(), originUrl);
  }
  try {
    if (target) {
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 });
      let state = await inspectDom(page).catch(() => null);
      // Widget/iframe de candidatura lazy — respiro p/ montar e 1 re-inspect.
      if (state && !hasFormFields(state)) {
        await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
        state = await inspectDom(page).catch(() => null);
      }
      return { page, state, moved: true, email: found.email };
    }
    if (!found.hasButton) return { page, state: null, moved: false, email: found.email };
    // Botón JS: puede navegar en la misma pestaña o abrir popup — cubre los dos.
    const winner = await clickApplyButton(page);
    if (!winner) return { page, state: null, moved: false, email: found.email };
    const state = await inspectDom(winner).catch(() => null);
    if (winner !== page) await page.close().catch(() => {});
    return { page: winner, state, moved: true, email: found.email };
  } catch {
    return { page, state: null, moved: false };
  }
}

/**
 * Cadena de candidatura multi-hop (hasta `maxHops`, default 10): listado →
 * página(s) intermedias → form del ATS real. Para si: encontró campos, no
 * hay más destinos/botones, o la URL ya fue visitada (anti-loop).
 * Devuelve el último estado inspeccionado (puede no tener campos — el
 * llamador decide canal) más un e-mail `mailto:` encontrado en el camino.
 * En popup, la pestaña original se cierra y `state.dom` es la nueva.
 */
export async function followApplyChain(
  page: Page,
  maxHops = 10,
): Promise<{ state: LivePageState | null; email?: string }> {
  let current = page;
  let last: LivePageState | null = null;
  let email: string | undefined;
  const originUrl = page.url();
  const visited = new Set<string>([originUrl]);
  for (let hop = 0; hop < maxHops; hop++) {
    const { page: p, state, moved, email: mail } = await applyHop(current, originUrl);
    if (mail && !email) email = mail;
    if (state) {
      last = state;
      if (hasFormFields(state)) return { state, email };
    }
    if (!moved) break; // sin destino/botón — parar
    if (visited.has(p.url())) break; // anti-loop (ver más, paginación…)
    visited.add(p.url());
    current = p;
  }
  return { state: last, email };
}

/**
 * Página de vaga sem form visível: sigue la cadena de candidatura (hasta 10
 * hops — listado → intermedias → form del ATS real). Retorna el estado de
 * destino solo si tiene campos — senão null (canal de mensagem, como antes).
 * Cobre href direto e botão que abre popup/target=_blank.
 */
export async function followApplyLink(page: Page): Promise<LivePageState | null> {
  const { state } = await followApplyChain(page);
  return hasFormFields(state) ? state : null;
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
        requiresLogin: false,
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
  if (!hasFormFields(state)) {
    await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
    state = await inspectDom(page, url);
  }
  return state;
}
