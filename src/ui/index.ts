import { spawn } from 'node:child_process';
import { newUiToken } from './auth';
import { listenUi, type UiServerHandle } from './server';

/**
 * Ponto de entrada `career ui` / `career serve`: sobe o servidor local e
 * (opcionalmente) abre o navegador. O app desktop Tauri usa `serve` headless —
 * spawn do sidecar e aponta a webview para a URL com token.
 */
export interface ServeUiOptions {
  /** 0 = porta aleatória livre. */
  port?: number;
  /** Abre o navegador padrão (default: true). */
  open?: boolean;
  /** Pasta do executável em SEA — integra a cadeia de config. */
  exeDir?: string;
}

export function openBrowser(url: string): void {
  const opener =
    process.platform === 'win32'
      ? { cmd: 'cmd', args: ['/c', 'start', '""', url] }
      : process.platform === 'darwin'
        ? { cmd: 'open', args: [url] }
        : { cmd: 'xdg-open', args: [url] };
  const child = spawn(opener.cmd, opener.args, { detached: true, stdio: 'ignore', shell: false });
  child.unref();
}

export async function serveUi(opts: ServeUiOptions = {}): Promise<UiServerHandle> {
  const token = newUiToken();
  const handle = await listenUi({ token, exeDir: opts.exeDir }, opts.port ?? 0);
  if (opts.open !== false) openBrowser(handle.url);
  return handle;
}
