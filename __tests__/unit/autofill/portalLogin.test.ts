import {
  loginRefForUrl,
  parseLoginCredential,
  tryPortalLogin,
} from '../../../src/autofill/portalLogin';
import type { Page } from 'playwright';

describe('loginRefForUrl', () => {
  // muro de login do portal → ref do cofre (login-<domínio>)
  it('maps gupy subdomains to login-gupy', () => {
    expect(loginRefForUrl('https://tmsa.gupy.io/candidates/signin')).toBe('login-gupy');
    expect(loginRefForUrl('https://portal.gupy.io/login')).toBe('login-gupy');
  });

  it('maps plain and country TLDs', () => {
    expect(loginRefForUrl('https://www.linkedin.com/uas/login')).toBe('login-linkedin');
    expect(loginRefForUrl('https://login.indeed.com.br/auth')).toBe('login-indeed');
    expect(loginRefForUrl('https://acme.co.uk/login')).toBe('login-acme');
  });

  it('returns null for malformed urls', () => {
    expect(loginRefForUrl('not-a-url')).toBeNull();
  });
});

describe('parseLoginCredential', () => {
  it('accepts user/pass and email/password keys', () => {
    expect(parseLoginCredential('{"user":"a@b.c","pass":"x"}')).toEqual({
      user: 'a@b.c',
      pass: 'x',
    });
    expect(parseLoginCredential('{"email":"a@b.c","password":"x"}')).toEqual({
      user: 'a@b.c',
      pass: 'x',
    });
  });

  it('rejects missing fields and bad json', () => {
    expect(parseLoginCredential('{"user":"a"}')).toBeNull();
    expect(parseLoginCredential('not json')).toBeNull();
  });
});

/** Page mínima: locator(count) por seletor + url mutável. */
function fakePage(url: string, counts: Record<string, number>, disabled = false) {
  const fillCalls: Array<[string, string]> = [];
  let pressed = 0;
  let clicked = 0;
  const locator = (sel: string) => {
    const n =
      Object.entries(counts).find(([k]) => sel.includes(k))?.[1] ??
      (sel.includes(':visible') ? 1 : 0);
    return {
      count: async () => n,
      first: () => ({
        count: async () => Math.min(n, 1),
        isDisabled: async () => disabled,
        clear: async () => {},
        fill: async (v: string) => {
          fillCalls.push([sel, v]);
        },
        pressSequentially: async (v: string) => {
          fillCalls.push([sel, v]);
        },
        press: async () => {
          pressed++;
        },
        click: async () => {
          clicked++;
        },
      }),
    };
  };
  let ticks = 0;
  const dom = {
    locator,
    frames: () => [],
    url: () => (ticks >= 2 ? url : 'https://tmsa.gupy.io/candidates/signin'),
    waitForLoadState: async () => {},
    waitForTimeout: async () => {
      ticks++;
    },
  };
  return { dom, fillCalls, pressed: () => pressed, clicked: () => clicked };
}

describe('tryPortalLogin', () => {
  const cred = { user: 'a@b.c', pass: 's3cret' };

  // doc 10: cofre login-* preenche o muro sozinho — URL sai do /signin
  it('fills user+password, submits and succeeds when url leaves signin', async () => {
    const { dom, fillCalls } = fakePage('https://tmsa.gupy.io/candidates/jobs/1/apply', {
      'input[type="password"]': 1,
      'input[type="text"]': 1,
      'button[type="submit"]': 1,
    });

    const ok = await tryPortalLogin(dom as unknown as Page, cred);

    expect(ok).toBe('success');
    expect(fillCalls).toContainEqual([expect.stringContaining('text'), 'a@b.c']);
    expect(fillCalls).toContainEqual(['input[type="password"]:visible', 's3cret']);
  });

  it('presses Enter when there is no submit button', async () => {
    const { dom, pressed } = fakePage('https://tmsa.gupy.io/candidates/jobs/1/apply', {
      'input[type="password"]': 1,
      'input[type="text"]': 1,
    });

    expect(await tryPortalLogin(dom as unknown as Page, cred)).toBe('success');
    expect(pressed()).toBe(1);
  });

  // React não habilita o submit enquanto valida campos — espera esgotada → falha
  it('fails when the submit stays disabled after typing', async () => {
    const { dom } = fakePage(
      'https://tmsa.gupy.io/candidates/signin',
      { 'input[type="password"]': 1, 'input[type="text"]': 1, 'button[type="submit"]': 1 },
      true,
    );

    expect(await tryPortalLogin(dom as unknown as Page, cred)).toBe('failed');
  });

  // reCAPTCHA segura o login → "Entrar sem senha" dispara magic link p/ e-mail
  it('falls back to passwordless magic link when a captcha holds the login', async () => {
    const { dom, fillCalls } = fakePage('https://tmsa.gupy.io/candidates/signin', {
      'input[type="password"]': 1,
      'input[type="text"]': 1,
      'button[type="submit"]': 1,
      'sem senha': 1,
    });

    expect(await tryPortalLogin(dom as unknown as Page, cred)).toBe('passwordless');
    // tela sem senha pede o e-mail de novo — digitado 2×: login + magic link
    const userTypes = fillCalls.filter(([sel, v]) => sel.includes('text') && v === 'a@b.c');
    expect(userTypes).toHaveLength(2);
  });

  it('fails fast when there is no password field (not a login wall)', async () => {
    const { dom } = fakePage('https://tmsa.gupy.io/candidates/signin', {
      'input[type="password"]': 0,
      'input[type="text"]': 1,
    });

    expect(await tryPortalLogin(dom as unknown as Page, cred)).toBe('failed');
  });
});
