/**
 * Snapshot/restauração de sessão de portal (doc 10, decisão #28).
 *
 * Gupy & cia usam cookies de sessão — sumem ao fechar o browser e por isso
 * TODO run pede login de novo em cada `<empresa>.gupy.io`. Depois de um login
 * bem-sucedido, gravamos os cookies do domínio no cofre (`session-<domínio>`);
 * ao bater no muro de login, injetamos o snapshot — se o token ainda for
 * válido no backend, a sessão volta sem login nem e-mail, e o mesmo snapshot
 * serve outros subdomínios do mesmo portal (token central).
 */

export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
}

/** Domínio registrável do host (gupy.io, linkedin.com…) — base da ref e do filtro. */
export function portalDomain(rawUrl: string): string | null {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  const parts = host.split('.');
  if (parts.length < 2) return null;
  return parts.slice(-2).join('.');
}

/** Ref do snapshot de sessão no cofre: tmsa.gupy.io → session-gupy-io. */
export function sessionRefForUrl(rawUrl: string): string | null {
  const domain = portalDomain(rawUrl);
  return domain ? `session-${domain.replace(/[^a-z0-9]+/g, '-')}` : null;
}

/** Cookies do contexto que pertencem ao domínio do portal (inclui `.gupy.io` e `empresa.gupy.io`). */
export function sessionCookiesFor(cookies: StoredCookie[], rawUrl: string): StoredCookie[] {
  const domain = portalDomain(rawUrl);
  if (!domain) return [];
  return cookies.filter(
    (c) => c.domain === `.${domain}` || c.domain === domain || c.domain.endsWith(`.${domain}`),
  );
}

/**
 * Mapeia snapshot p/ addCookies: cookies presos a um host específico
 * (`tmsa.gupy.io`) são re-escopados p/ `.{domínio}` — servem qualquer
 * subdomínio do portal na reinjeção.
 */
export function mapForRestore(cookies: StoredCookie[], rawUrl: string): StoredCookie[] {
  const domain = portalDomain(rawUrl);
  if (!domain) return [];
  return sessionCookiesFor(cookies, rawUrl).map((c) => ({
    ...c,
    domain: `.${domain}`,
    sameSite: c.sameSite === 'None' || c.sameSite === 'Strict' ? c.sameSite : 'Lax',
  }));
}
