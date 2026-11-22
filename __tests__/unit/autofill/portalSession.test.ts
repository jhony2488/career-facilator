import {
  mapForRestore,
  portalDomain,
  sessionCookiesFor,
  sessionRefForUrl,
} from '../../../src/autofill/portalSession';

describe('portalDomain', () => {
  it('returns the registrable domain for company subdomains', () => {
    expect(portalDomain('https://tmsa.gupy.io/candidates/signin')).toBe('gupy.io');
    expect(portalDomain('https://portal.gupy.io/')).toBe('gupy.io');
    expect(portalDomain('https://jobs.lever.co/x')).toBe('lever.co');
  });

  it('returns null for malformed urls', () => {
    expect(portalDomain('not-a-url')).toBeNull();
    expect(portalDomain('')).toBeNull();
  });
});

describe('sessionRefForUrl', () => {
  it('maps any subdomain to the same session ref', () => {
    expect(sessionRefForUrl('https://tmsa.gupy.io/candidates/signin')).toBe('session-gupy-io');
    expect(sessionRefForUrl('https://sucalog.gupy.io/jobs/1')).toBe('session-gupy-io');
  });
});

const ck = (domain: string, name = 's'): Parameters<typeof sessionCookiesFor>[0][number] => ({
  name,
  value: 'v',
  domain,
  path: '/',
  expires: -1,
  httpOnly: true,
  secure: true,
});

describe('sessionCookiesFor / mapForRestore', () => {
  it('keeps only cookies belonging to the portal domain', () => {
    const cookies = [ck('.gupy.io', 'a'), ck('tmsa.gupy.io', 'b'), ck('.google.com', 'c')];
    expect(sessionCookiesFor(cookies, 'https://sucalog.gupy.io/x').map((c) => c.name)).toEqual([
      'a',
      'b',
    ]);
  });

  // decisão #28: cookie preso a host é re-escopado p/ .domínio — serve outros
  // subdomínios do portal quando o token é central
  it('rescopes host-bound cookies to the registrable domain', () => {
    const cookies = [ck('tmsa.gupy.io', 'sess'), ck('.gupy.io', 'loc')];
    const mapped = mapForRestore(cookies, 'https://sucalog.gupy.io/x');
    expect(mapped.map((c) => c.domain)).toEqual(['.gupy.io', '.gupy.io']);
    expect(mapped.every((c) => c.sameSite === 'Lax')).toBe(true);
  });
});
