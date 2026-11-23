import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadEffectiveEnv, parseEnvFile, type LoadConfigOptions } from '../config/loadConfig';
import type { HomeAnchor } from '../config/paths';

/**
 * Listagem do env efetivo para a UI com a fonte de cada chave
 * (mesma cadeia do app: <home>/.env < ./.env < <exe>/.env < process.env).
 * Valores sensíveis saem mascarados — a UI nunca exibe segredos; para editar,
 * o usuário envia PUT com o valor novo (reescrita no <home>/.env).
 */
export type EnvSource = 'process' | 'exe' | 'cwd' | 'home';

export interface EnvEntry {
  key: string;
  value: string;
  source: EnvSource;
  masked: boolean;
}

export interface EnvListing {
  entries: EnvEntry[];
  homeEnvFile: string;
  cwdEnvFile: string;
  exeEnvFile?: string;
}

const SECRET_RE = /(API_KEY|_KEY|_SECRET|SECRET|PASSWORD|_PASS\b|PASS$|TOKEN|CREDENTIAL)/i;
const MASK = '••••••••';

export function listEnvEntries(
  seaOpts: HomeAnchor & Pick<LoadConfigOptions, 'envFile' | 'env'> = {},
): EnvListing {
  const eff = loadEffectiveEnv(seaOpts);
  // Mesmo arquivo "cwd" do loadEffectiveEnv (opts.envFile — relativo ao cwd).
  const cwdEnvFile = resolve(seaOpts.envFile ?? '.env');
  const exeEnvFile = seaOpts.exeDir ? join(seaOpts.exeDir, '.env') : undefined;

  const homeEnv = existsSync(eff.homeEnvFile) ? parseEnvFile(eff.homeEnvFile) : {};
  const cwdEnv = existsSync(cwdEnvFile) ? parseEnvFile(cwdEnvFile) : {};
  const exeEnv = exeEnvFile && existsSync(exeEnvFile) ? parseEnvFile(exeEnvFile) : {};

  // Fonte por chave: o arquivo mais forte que a define (cadeia de precedência).
  const sourceOf = (key: string): EnvSource => {
    if (process.env[key] !== undefined) return 'process';
    if (exeEnvFile && exeEnv[key] !== undefined) return 'exe';
    if (cwdEnv[key] !== undefined) return 'cwd';
    return 'home';
  };

  const keys = new Set<string>([
    ...Object.keys(homeEnv),
    ...Object.keys(cwdEnv),
    ...Object.keys(exeEnv),
    ...Object.keys(eff.env).filter((k) => k.startsWith('CAREER') || k.includes('_')),
  ]);
  const entries = [...keys]
    .sort()
    .filter((k) => eff.env[k] !== undefined)
    .map((k) => {
      const masked = SECRET_RE.test(k);
      return {
        key: k,
        value: masked ? MASK : (eff.env[k] ?? ''),
        source: sourceOf(k),
        masked,
      };
    });
  return { entries, homeEnvFile: eff.homeEnvFile, cwdEnvFile, exeEnvFile };
}
