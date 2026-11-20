import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import {
  defaultCareerOpsConfig,
  type CareerOpsConfig,
  type ExecutionMode,
  type ModelRouting,
} from './careerOps.config';
import { careerHome } from './paths';

/** Modelo padrão por provider quando nem AI_<TIER>_MODEL nem <PROVIDER>_MODEL estão definidos. */
export const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  ollama: 'qwen2.5:7b',
  groq: 'llama-3.1-8b-instant',
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4o-mini',
  kimi: 'moonshot-v1-8k',
  moonshot: 'moonshot-v1-8k',
  gemini: 'gemini-2.0-flash',
  google: 'gemini-2.0-flash',
};

export type EnvMap = Record<string, string | undefined>;

/** Parser mínimo de .env — KEY=VALUE, '#' comenta, aspas simples/duplas opcionais. Sem dependência. */
export function parseEnvFile(path: string): EnvMap {
  const abs = resolve(path);
  if (!existsSync(abs)) return {};
  const out: EnvMap = {};
  for (const rawLine of readFileSync(abs, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

export interface LoadConfigOptions {
  /** Mapa de env explícito (default: .env + process.env). */
  env?: EnvMap;
  /** Caminho do .env; string vazia desativa a leitura de arquivo. */
  envFile?: string;
}

const providerEnvKey = (provider: string): string =>
  provider.toUpperCase().replace(/[^A-Z0-9]/g, '_');

function resolveTier(key: 'local' | 'fast' | 'smart', env: EnvMap): ModelRouting {
  const T = key.toUpperCase();
  const provider =
    (env[`AI_${T}_PROVIDER`] ?? '').trim().toLowerCase() ||
    defaultCareerOpsConfig.ai[key].provider;
  const P = providerEnvKey(provider);
  const modelId =
    env[`AI_${T}_MODEL`] ??
    env[`${P}_MODEL`] ??
    PROVIDER_DEFAULT_MODELS[provider] ??
    defaultCareerOpsConfig.ai[key].modelId;
  const baseUrl =
    env[`AI_${T}_BASE_URL`] ??
    env[`${P}_BASE_URL`] ??
    (provider === 'ollama' ? 'http://localhost:11434' : undefined);
  return {
    provider,
    modelId,
    baseUrl,
    apiKeyEnv: provider === 'ollama' ? undefined : `${P}_API_KEY`,
  };
}



/** Caminho absoluto passa direto; relativo resolve sob careerHome. */
function resolveHomePath(rel: string, home: string): string {
  return isAbsolute(rel) ? rel : join(home, rel);
}

export interface EffectiveEnv {
  env: EnvMap;
  home: string;
  homeEnvFile: string;
}

/**
 * Cadeia de env efetiva: <home>/.env ← ./.env (cwd, dev) ← variáveis de ambiente.
 * `<home>` = CAREER_HOME (de .env local ou process.env) ou ~/.careerfacilator.
 * Exportada para o CLI resolver paths e escrever `config set` no arquivo certo.
 */
export function loadEffectiveEnv(opts: LoadConfigOptions = {}): EffectiveEnv {
  const procEnv = opts.env ?? process.env;
  const localFileEnv = opts.envFile === '' ? {} : parseEnvFile(opts.envFile ?? '.env');
  const home = careerHome({ ...localFileEnv, ...procEnv });
  const homeEnvFile = join(home, '.env');

  let homeFileEnv: EnvMap = {};
  if (opts.envFile !== '' && resolve(homeEnvFile) !== resolve(opts.envFile ?? '.env')) {
    homeFileEnv = parseEnvFile(homeEnvFile);
  }

  return { env: { ...homeFileEnv, ...localFileEnv, ...procEnv }, home, homeEnvFile };
}

/**
 * Config efetiva: defaultCareerOpsConfig ← <home>/.env ← ./.env ← variáveis de ambiente.
 *
 * - Troca provider/modelo por tier via AI_{LOCAL,FAST,SMART}_{PROVIDER,MODEL,BASE_URL}
 *   e <PROVIDER>_{API_KEY,MODEL,BASE_URL}
 * - Paths de perfil/storage: PROFILE_{INBOX_DIR,DRAFT_PATH,MASTER_PATH,COMPILED_PATH,
 *   HISTORY_DIR} e JOBS_DB_PATH — relativos resolvem sob <home>
 */
export function loadCareerOpsConfig(opts: LoadConfigOptions = {}): CareerOpsConfig {
  const { env, home } = loadEffectiveEnv(opts);
  const homePath = (rel: string) => resolveHomePath(rel, home);

  const mode = env.EXECUTION_MODE as ExecutionMode | undefined;
  const lexicalMinTerms = env.LEXICAL_MIN_TERMS
    ? Number(env.LEXICAL_MIN_TERMS)
    : defaultCareerOpsConfig.execution.lexicalMinTerms;
  const embeddingsEnabled =
    env.AI_EMBEDDINGS_ENABLED === 'true' || env.AI_EMBEDDINGS_ENABLED === '1';
  return {
    ...defaultCareerOpsConfig,
    execution: {
      ...defaultCareerOpsConfig.execution,
      ...(mode ? { mode } : {}),
      lexicalMinTerms,
    },
    ai: {
      local: resolveTier('local', env),
      fast: resolveTier('fast', env),
      smart: resolveTier('smart', env),
      ...(embeddingsEnabled
        ? {
            embeddings: {
              enabled: true,
              modelId: env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text',
            },
          }
        : {}),
    },
    profile: {
      inboxDir: homePath(env.PROFILE_INBOX_DIR ?? defaultCareerOpsConfig.profile.inboxDir),
      draftPath: homePath(env.PROFILE_DRAFT_PATH ?? defaultCareerOpsConfig.profile.draftPath),
      masterPath: homePath(env.PROFILE_MASTER_PATH ?? defaultCareerOpsConfig.profile.masterPath),
      compiledPath: homePath(
        env.PROFILE_COMPILED_PATH ?? defaultCareerOpsConfig.profile.compiledPath,
      ),
      historyDir: homePath(
        env.PROFILE_HISTORY_DIR ?? defaultCareerOpsConfig.profile.historyDir,
      ),
    },
  };
}
