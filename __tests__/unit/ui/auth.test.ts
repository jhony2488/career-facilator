import type { IncomingMessage } from 'node:http';
import { newUiToken, tokenOk } from '../../../src/ui/auth';

function fakeReq(url: string, headers: Record<string, string> = {}): IncomingMessage {
  return { url, headers } as IncomingMessage;
}

describe('ui/auth', () => {
  it('generates 48-hex-char session tokens', () => {
    const tok = newUiToken();
    expect(tok).toMatch(/^[0-9a-f]{48}$/);
    expect(newUiToken()).not.toBe(tok); // random per session
  });

  it('accepts the token via X-UI-Token header', () => {
    const tok = newUiToken();
    expect(tokenOk(fakeReq('/api/meta', { 'x-ui-token': tok }), tok)).toBe(true);
  });

  it('accepts the token via ?token= query (SSE/direct navigation)', () => {
    const tok = newUiToken();
    expect(tokenOk(fakeReq(`/api/tasks/1/events?token=${tok}`), tok)).toBe(true);
  });

  it('rejects missing, wrong or mistyped-length tokens', () => {
    const tok = newUiToken();
    expect(tokenOk(fakeReq('/api/meta'), tok)).toBe(false);
    expect(tokenOk(fakeReq('/api/meta', { 'x-ui-token': 'a'.repeat(48) }), tok)).toBe(false);
    expect(tokenOk(fakeReq('/api/meta', { 'x-ui-token': tok + 'x' }), tok)).toBe(false);
  });
});
