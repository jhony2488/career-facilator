import type { Page } from 'playwright';

/**
 * Autologin de portal com credencial do cofre (doc 10): muro de login
 * (`/signin`, `/login`…) → ref `login-<domínio>` no cofre → preenche
 * usuário+senha e submete. Ex.: `*.gupy.io/candidates/signin` → `login-gupy`.
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
const USER_FIELD_SEL = [
  'input[type="email"]',
  'input[name*="email" i]',
  'input[name*="user" i]',
  'input[name*="login" i]',
  'input[name*="cpf" i]',
  'input[type="text"]:visible',
].join(', ');

/**
 * Preenche o form de login da página atual e submete. Sucesso = URL sai do
 * /signin|login OU some o input de senha (SPA sem redirect). Timeout ~15s.
 */
export async function tryPortalLogin(
  dom: Pick<Page, 'locator' | 'waitForLoadState' | 'url' | 'waitForTimeout'>,
  cred: { user: string; pass: string },
): Promise<boolean> {
  try {
    const password = dom.locator('input[type="password"]:visible').first();
    if ((await password.count()) === 0) return false;

    const userField = dom.locator(USER_FIELD_SEL).first();
    if ((await userField.count()) === 0) return false;

    await userField.fill(cred.user);
    await password.fill(cred.pass);

    const submit = dom.locator(
      `button[type="submit"], input[type="submit"], button:has-text("${'entrar'}"), ` +
        `button:has-text("${'acessar'}"), button:has-text("${'sign in'}"), ` +
        `button:has-text("${'log in'}"), button:has-text("${'continuar'}")`,
    );
    if ((await submit.count()) > 0) {
      await submit.first().click();
    } else {
      await password.press('Enter');
    }

    // Sucesso = saiu da URL de auth ou a senha sumiu (SPA sem redirect).
    for (let i = 0; i < 15; i++) {
      await dom.waitForTimeout(1000);
      if (!AUTH_URL_RE.test(dom.url())) return true;
      if ((await dom.locator('input[type="password"]:visible').count()) === 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}
