import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

/** Mapa de env — mesmo shape de EnvMap em loadConfig (sem import: evita ciclo). */
type EnvMap = Record<string, string | undefined>;

export const HOME_ENV_KEY = 'CAREER_HOME';
export const DEFAULT_HOME_DIRNAME = '.careerfacilator';

export interface HomeAnchor {
  /**
   * Âncora para `CAREER_HOME` (e paths relativos) — no executável SEA é o dir
   * do próprio binário: `CAREER_HOME=.` mantém os dados ao lado do exe, sem
   * depender do cwd de onde ele foi chamado. Em dev/teste, omitido = cwd.
   */
  exeDir?: string;
}

/**
 * Diretório de dados do usuário. Ordem: env CAREER_HOME → ~/.careerfacilator.
 * Caminho relativo resolve contra `opts.exeDir` quando presente (binário
 * portátil), senão contra o cwd. Em dev, `.env` do repo fixa CAREER_HOME=.
 */
export function careerHome(env: EnvMap = process.env, opts: HomeAnchor = {}): string {
  const custom = env[HOME_ENV_KEY]?.trim();
  if (!custom) return join(homedir(), DEFAULT_HOME_DIRNAME);
  if (isAbsolute(custom)) return custom;
  return resolve(opts.exeDir ?? '.', custom);
}

/** Caminho absoluto passa direto; relativo resolve sob careerHome. */
export function resolveHome(rel: string, env: EnvMap = process.env, opts: HomeAnchor = {}): string {
  return isAbsolute(rel) ? rel : join(careerHome(env, opts), rel);
}

/** Arquivo de configuração global da CLI. */
export function envFilePath(env: EnvMap = process.env, opts: HomeAnchor = {}): string {
  return join(careerHome(env, opts), '.env');
}

/** Raiz do pacote instalado — assets internos (skills) resolvem daqui, não do cwd. */
export const packageRoot = resolve(__dirname, '../..');
