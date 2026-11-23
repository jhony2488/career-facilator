import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { packageRoot } from '../config/paths';

/**
 * Resolução de módulos externos no executável SEA (doc de distribuição).
 *
 * playwright*, playwright-extra, pdf-parse e tesseract.js ficam FORA do bundle
 * single-file (requires dinâmicos/fs internos). No exe eles são carregados de
 * um runtime sidecar — `career-runtime/node_modules` ao lado do binário (ou
 * `CAREER_RUNTIME` apontando outro diretório). Sem o runtime, os loaders falham
 * e quem chama segue na degradação já existente (canal de mensagem/revisão).
 *
 * Em dev (tsx/jest) o caminho é o `import()` normal contra o node_modules do
 * projeto — nada muda.
 */
let seaCache: boolean | undefined;

/** Detecta execução como Single Executable Application (Node ≥20). */
export function isSea(): boolean {
  if (seaCache === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- detecção síncrona de SEA
      const sea = require('node:sea') as { isSea?: () => boolean };
      seaCache = Boolean(sea.isSea?.());
    } catch {
      seaCache = false;
    }
  }
  return seaCache;
}

/** Diretório do executável — só faz sentido em SEA; em dev é o node/tsx. */
export function exeDir(): string {
  return dirname(process.execPath);
}

/**
 * Candidatos de raiz de runtime, em ordem: `CAREER_RUNTIME` (override
 * explícito) → `<exe>/career-runtime` (layout do pacote zip) → `packageRoot`
 * (dev — o node_modules do projeto resolve tudo).
 */
export function runtimeDirCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const out: string[] = [];
  const custom = env.CAREER_RUNTIME?.trim();
  if (custom) out.push(isAbsolute(custom) ? custom : resolve(custom));
  out.push(join(exeDir(), 'career-runtime'));
  out.push(packageRoot);
  return out;
}

/** Primeiro candidato de runtime existente no disco (null = nenhum). */
export function runtimeDir(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const dir of runtimeDirCandidates(env)) {
    if (existsSync(join(dir, 'node_modules'))) return dir;
  }
  return null;
}

/**
 * Carrega um pacote externo do runtime. Tenta `import()` primeiro (dev/tsx e
 * pacotes embutidos no bundle); falhando, tenta `createRequire` contra cada
 * candidato de runtime — os pacotes CJS do sidecar resolvem suas próprias
 * deps internas (worker files, wasm, etc.). O último candidato é o
 * packageRoot, que resolve o node_modules do projeto em dev/testes.
 */
export async function loadRuntimeModule<T = unknown>(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<T> {
  let lastErr: unknown;
  try {
    return (await import(name)) as T;
  } catch (e) {
    lastErr = e;
  }
  for (const dir of runtimeDirCandidates(env)) {
    try {
      return createRequire(join(dir, 'runtime-marker.cjs'))(name) as T;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Módulo de runtime indisponível: ${name}`);
}

/**
 * Aponta `PLAYWRIGHT_BROWSERS_PATH` para `<runtime>/browsers` quando o usuário
 * não definiu o env e a pasta existe — playwright-core lê o env no launch.
 */
export function ensureBrowserRuntimeEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (env.PLAYWRIGHT_BROWSERS_PATH?.trim()) return;
  const dir = runtimeDir(env);
  if (dir && existsSync(join(dir, 'browsers'))) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = join(dir, 'browsers');
  }
}

/** Pasta de traineddata do OCR dentro do runtime (null quando ausente). */
export function tessdataDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const dir = runtimeDir(env);
  if (!dir) return null;
  const tess = join(dir, 'tessdata');
  return existsSync(tess) ? tess : null;
}
