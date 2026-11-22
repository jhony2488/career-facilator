import type { Page } from 'playwright';

/**
 * Autologin de portal com credencial do cofre (doc 10): muro de login
 * (`/signin`, `/login`…) → ref `login-<domínio>` no cofre → digita
 * usuário+senha (pressSequentially — forms React não habilitam o submit com
 * `fill`) e submete. Ex.: `*.gupy.io/candidates/signin` → `login-gupy`.
 * Credencial gravada via `vault set login-gupy` (user/pass cifrados).
 */

/** TLDs de duas partes — `tmsa.gupy.io`→gupy, `x.com.br`→x(com.br). */
const SECOND_LEVEL_TLDS = new Set([
  'com.br',
  'com.ar',
  'com.co',
  'com.mx',
  'co.uk',
  'com.au',
  'com.pt',
]);

/** `https://tmsa.gupy.io/candidates/signin` → 'login-gupy'. */
export function loginRefForUrl(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2) return null;
  const last2 = labels.slice(-2).join('.');
  const key = SECOND_LEVEL_TLDS.has(last2) ? labels[labels.length - 3] : labels[labels.length - 2];
  return key ? `login-${key}` : null;
}

export function parseLoginCredential(json: string): { user: string; pass: string } | null {
  try {
    const c = JSON.parse(json) as Record<string, unknown>;
    const user = String(c.user ?? c.email ?? c.username ?? '');
    const pass = String(c.pass ?? c.password ?? '');
    return user && pass ? { user, pass } : null;
  } catch {
    return null;
  }
}

const AUTH_URL_RE = /signin|sign-in|login|entrar|auth/i;
const CHALLENGE_FRAME_RE = /challenge|recaptcha|hcaptcha|turnstile|arkoselabs/i;
const USER_FIELD_SEL = [
  'input[type="email"]',
  'input[name*="email" i]',
  'input[name*="user" i]',
  'input[name*="login" i]',
  'input[name*="cpf" i]',
  'input[type="text"]:visible',
].join(', ');

/**
 * Checkbox "confirme que é humano" (Cloudflare Turnstile/reCAPTCHA) vive
 * dentro de iframe cross-origin — clicar no iframe em si não faz nada; o
 * alvo é o checkbox interno do frame. Best-effort: se não achar, o humano
 * resolve na janela visível.
 */
export async function clickHumanVerification(dom: Pick<Page, 'frames'>): Promise<boolean> {
  for (const frame of dom.frames()) {
    if (!CHALLENGE_FRAME_RE.test(frame.url())) continue;
    const box = frame
      .locator('input[type="checkbox"], [role="checkbox"], .cb-lb, label.cb-lb')
      .first();
    try {
      await box.click({ timeout: 3000 });
      return true;
    } catch {
      // frame seguinte
    }
  }
  return false;
}

/** Banner de cookies cobre o form — aceita/rejeita p/ liberar os cliques. */
async function acceptCookieBanner(dom: Pick<Page, 'locator'>): Promise<void> {
  const btn = dom
    .locator(
      'button:has-text("Aceitar Cookies"), button:has-text("Accept"), ' +
        'button:has-text("Rejeitar"), button:has-text("Reject")',
    )
    .first();
  await btn.click({ timeout: 2000 }).catch(() => {});
}

export type PortalLoginDom = Pick<
  Page,
  'locator' | 'url' | 'waitForTimeout' | 'frames'
>;

/**
 * Digita credenciais no form de login da página atual e submete. Sucesso =
 * URL sai do /signin|login OU some o input de senha (SPA sem redirect).
 * Timeout ~18s. Tenta o checkbox de verificação humana uma vez — Cloudflare
 * teimoso cai p/ resolução manual.
 */
export async function tryPortalLogin(
  dom: PortalLoginDom,
  cred: { user: string; pass: string },
): Promise<boolean> {
  try {
    await acceptCookieBanner(dom);

    const password = dom.locator('input[type="password"]:visible').first();
    if ((await password.count()) === 0) return false;

    const userField = dom.locator(USER_FIELD_SEL).first();
    if ((await userField.count()) === 0) return false;

    // pressSequentially = keystrokes reais — Gupy/React não habilita o submit com .fill()
    await userField.pressSequentially(cred.user, { delay: 40 });
    await password.pressSequentially(cred.pass, { delay: 40 });

    const submit = dom.locator(
      `button[type="submit"], input[type="submit"], button:has-text("${'entrar'}"), ` +
        `button:has-text("${'acessar'}"), button:has-text("${'sign in'}"), ` +
        `button:has-text("${'log in'}"), button:has-text("${'continuar'}")`,
    );
    if ((await submit.count()) > 0) {
      // React habilita o botão após validar os campos — espera destravar.
      const btn = submit.first();
      for (let i = 0; i < 10 && (await btn.isDisabled()); i++) await dom.waitForTimeout(300);
      if (await btn.isDisabled()) return false;
      await btn.click();
    } else {
      await password.press('Enter');
    }

    // "Confirme que é humano" — clica o checkbox do frame de challenge uma vez.
    await clickHumanVerification(dom).catch(() => false);

    // Sucesso = saiu da URL de auth ou a senha sumiu (SPA sem redirect).
    for (let i = 0; i < 18; i++) {
      await dom.waitForTimeout(1000);
      if (!AUTH_URL_RE.test(dom.url())) return true;
      if ((await dom.locator('input[type="password"]:visible').count()) === 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}
