import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/**
 * Token de sessão da UI local. O servidor só escuta em 127.0.0.1, mas o token
 * impede que qualquer página local (outro site com JS malicioso) chame a API —
 * endpoints que leem/enviam config, cofre e dados exigem o token no header
 * `X-UI-Token` ou no query `?token=` (para SSE/navegação direta).
 */
export function newUiToken(): string {
  return randomBytes(24).toString('hex');
}

export function tokenOk(req: IncomingMessage, expected: string): boolean {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const given = req.headers['x-ui-token'] ?? url.searchParams.get('token') ?? '';
  if (typeof given !== 'string' || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
