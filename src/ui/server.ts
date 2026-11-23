import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { handleApi, type ApiDeps } from './api';
import { readUiAsset } from './readUiAsset';

/**
 * Servidor HTTP local da UI. Bind exclusivo em 127.0.0.1 + token de sessão —
 * a UI é uma página estática servida por assets; toda operação passa pela API
 * autenticada (ver auth.ts).
 */
export interface UiServerHandle {
  url: string;
  port: number;
  token: string;
  close: () => Promise<void>;
}

const STATIC_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(pathname: string, res: ServerResponse): boolean {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (rel.includes('..')) return false;
  const buf = readUiAsset(rel);
  if (!buf) return false;
  const ext = rel.slice(rel.lastIndexOf('.')).toLowerCase();
  res.writeHead(200, {
    'content-type': STATIC_MIME[ext] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  res.end(buf);
  return true;
}

export function createUiServer(deps: ApiDeps): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    void handleApi(req, res, deps).then((handled) => {
      if (handled || res.writableEnded) return;
      if (!serveStatic(pathname, res)) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found');
      }
    });
  });
}

export async function listenUi(deps: ApiDeps, port = 0): Promise<UiServerHandle> {
  const server = createUiServer(deps);
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(port, '127.0.0.1', () => resolvePromise());
  });
  const actual = (server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${actual}/?token=${deps.token}`;
  return {
    url,
    port: actual,
    token: deps.token,
    close: () =>
      new Promise<void>((resolvePromise) => {
        server.closeAllConnections?.();
        server.close(() => resolvePromise());
      }),
  };
}
