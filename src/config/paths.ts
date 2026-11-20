import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

/** Mapa de env — mesmo shape de EnvMap em loadConfig (sem import: evita ciclo). */
type EnvMap = Record<string, string | undefined>;

export const HOME_ENV_KEY = 'CAREER_HOME';
export const DEFAULT_HOME_DIRNAME = '.careerfacilator';

/**
 * Diretório de dados do usuário. Ordem: env CAREER_HOME → ~/.careerfacilator.
 * Em dev, `.env` do repo pode fixar CAREER_HOME=. para manter os dados locais.
 */
export function careerHome(env: EnvMap = process.env): string {
  const custom = env[HOME_ENV_KEY]?.trim();
  return custom ? resolve(custom) : join(homedir(), DEFAULT_HOME_DIRNAME);
}

/** Caminho absoluto passa direto; relativo resolve sob careerHome. */
export function resolveHome(rel: string, env: EnvMap = process.env): string {
  return isAbsolute(rel) ? rel : join(careerHome(env), rel);
}

/** Arquivo de configuração global da CLI. */
export function envFilePath(env: EnvMap = process.env): string {
  return join(careerHome(env), '.env');
}

/** Raiz do pacote instalado — assets internos (skills) resolvem daqui, não do cwd. */
export const packageRoot = resolve(__dirname, '../..');
