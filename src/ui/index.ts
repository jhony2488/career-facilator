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

/**
 * Abre a UI em janela "app-mode" (--app=): a página vira uma janela nativa sem
 * abas nem barra de endereço — comportamento de app desktop mesmo sem o pacote
 * Tauri. Edge é pré-instalado no Windows 10/11; Chrome/Chromium e a abertura
 * comum são fallbacks em ordem.
 */
export function openBrowser(url: string): void {
  const candidates: Array<{ cmd: string; args: string[] }> =
    process.platform === 'win32'
      ? [
          { cmd: 'cmd', args: ['/c', 'start', '""', 'msedge', `--app=${url}`] },
          { cmd: 'cmd', args: ['/c', 'start', '""', 'chrome', `--app=${url}`] },
          { cmd: 'cmd', args: ['/c', 'start', '""', url] },
        ]
      : process.platform === 'darwin'
        ? [
            { cmd: 'open', args: ['-na', 'Google Chrome', '--args', `--app=${url}`] },
            { cmd: 'open', args: [url] },
          ]
        : [
            { cmd: 'google-chrome', args: [`--app=${url}`] },
            { cmd: 'chromium', args: [`--app=${url}`] },
            { cmd: 'xdg-open', args: [url] },
          ];
  const tryNext = (i: number): void => {
    if (i >= candidates.length) return;
    const c = candidates[i];
    let child;
    try {
      child = spawn(c.cmd, c.args, { detached: true, stdio: 'ignore' });
    } catch {
      tryNext(i + 1);
      return;
    }
    child.on('error', () => tryNext(i + 1));
    child.on('spawn', () => {
      child.removeAllListeners('error');
      child.unref();
    });
  };
  tryNext(0);
}

export async function serveUi(opts: ServeUiOptions = {}): Promise<UiServerHandle> {
  const token = newUiToken();
  const handle = await listenUi({ token, exeDir: opts.exeDir }, opts.port ?? 0);
  if (opts.open !== false) openBrowser(handle.url);
  return handle;
}
