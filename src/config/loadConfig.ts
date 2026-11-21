import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import {
  defaultCareerOpsConfig,
  type CareerOpsConfig,
  type EmailDispatchMode,
  type ExecutionMode,
  type ModelRouting,
  type WhatsappMode,
  type WorkModel,
  type SearchEngine,
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
  deepseek: 'deepseek-chat',
  openrouter: 'openai/gpt-4o-mini',
  together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
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
    } else {
      // Comentário inline padrão dotenv: ' #' encerra o valor (exceto em aspas).
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trimEnd();
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
    (env[`AI_${T}_PROVIDER`] ?? '').trim().toLowerCase() || defaultCareerOpsConfig.ai[key].provider;
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

/** Routing explícito para provider:modelo (fallback customizado via AI_<T>_FALLBACK). */
function routingForSpec(spec: string, env: EnvMap): ModelRouting {
  const [provider, ...rest] = spec.split(':');
  const modelId = rest.join(':') || undefined;
  const P = providerEnvKey(provider);
  return {
    provider,
    modelId: modelId ?? env[`${P}_MODEL`] ?? PROVIDER_DEFAULT_MODELS[provider] ?? provider,
    baseUrl: env[`${P}_BASE_URL`] ?? (provider === 'ollama' ? 'http://localhost:11434' : undefined),
    apiKeyEnv: provider === 'ollama' ? undefined : `${P}_API_KEY`,
  };
}

/**
 * Gramática de AI_<TIER>_FALLBACK: 'off'/'none' → sem fallback; 'local'|'fast'|'smart'
 * → roteamento daquele tier; '<provider>[:<modelo>]' → routing explícito.
 * Default da spec: local→fast, smart→fast, fast→off. AI_FALLBACK_ENABLED=false desliga tudo.
 */
function resolveFallback(
  key: 'local' | 'fast' | 'smart',
  env: EnvMap,
  tiers: Record<'local' | 'fast' | 'smart', ModelRouting>,
): ModelRouting | 'off' | undefined {
  if (env.AI_FALLBACK_ENABLED === 'false' || env.AI_FALLBACK_ENABLED === '0') return 'off';
  const raw = (env[`AI_${key.toUpperCase()}_FALLBACK`] ?? '').trim().toLowerCase();
  if (raw === 'off' || raw === 'none') return 'off';
  if (raw === 'local' || raw === 'fast' || raw === 'smart') return tiers[raw];
  if (raw) return routingForSpec(raw, env);
  return key === 'fast' ? 'off' : tiers.fast;
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
  const fitMin = Number(env.FIT_MIN_SCORE);
  const fitAuto = Number(env.FIT_AUTO_SCORE);
  const numEnv = (v: string | undefined): number => (v?.trim() ? Number(v) : NaN);
  const maxJobsRun = numEnv(env.DISCOVERY_MAX_JOBS_PER_RUN);
  const minJobsRun = numEnv(env.DISCOVERY_MIN_JOBS_PER_RUN);
  const titles = env.JOB_TITLES?.split(/[;,]/)
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    ...defaultCareerOpsConfig,
    execution: {
      ...defaultCareerOpsConfig.execution,
      ...(mode ? { mode } : {}),
      lexicalMinTerms,
      ...(Number.isFinite(fitMin) ? { minScoreForTailoring: fitMin } : {}),
      ...(Number.isFinite(fitAuto) ? { minScoreForFullAuto: fitAuto } : {}),
      ...(Number.isFinite(maxJobsRun) ? { maxJobsPerRun: maxJobsRun } : {}),
      ...(Number.isFinite(minJobsRun) ? { minJobsPerRun: minJobsRun } : {}),
    },
    discovery: {
      targetTitles: titles?.length ? titles : defaultCareerOpsConfig.discovery.targetTitles,
      sources: env.DISCOVERY_SOURCES
        ? env.DISCOVERY_SOURCES.split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : defaultCareerOpsConfig.discovery.sources,
      excludeSources: env.DISCOVERY_EXCLUDE_SOURCES
        ? env.DISCOVERY_EXCLUDE_SOURCES.split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : defaultCareerOpsConfig.discovery.excludeSources,
      regions: env.DISCOVERY_REGIONS
        ? env.DISCOVERY_REGIONS.split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : defaultCareerOpsConfig.discovery.regions,
      workModels: env.DISCOVERY_WORK_MODELS
        ? env.DISCOVERY_WORK_MODELS.split(/[,;]/)
            .map((s) => s.trim().toUpperCase() as WorkModel)
            .filter(Boolean)
        : defaultCareerOpsConfig.discovery.workModels,
      maxJobsPerSource: env.DISCOVERY_MAX_JOBS_PER_SOURCE
        ? Number(env.DISCOVERY_MAX_JOBS_PER_SOURCE)
        : defaultCareerOpsConfig.discovery.maxJobsPerSource,
      concurrency: env.DISCOVERY_CONCURRENCY
        ? Number(env.DISCOVERY_CONCURRENCY)
        : defaultCareerOpsConfig.discovery.concurrency,
      perDomainDelayMs: env.DISCOVERY_PER_DOMAIN_DELAY_MS
        ? Number(env.DISCOVERY_PER_DOMAIN_DELAY_MS)
        : defaultCareerOpsConfig.discovery.perDomainDelayMs,
      searchEngine:
        (env.DISCOVERY_SEARCH_ENGINE as SearchEngine | undefined) ??
        defaultCareerOpsConfig.discovery.searchEngine,
      searchResultLimit: env.DISCOVERY_SEARCH_RESULT_LIMIT
        ? Number(env.DISCOVERY_SEARCH_RESULT_LIMIT)
        : defaultCareerOpsConfig.discovery.searchResultLimit,
      useGenericHtmlFallback:
        env.DISCOVERY_USE_GENERIC_FALLBACK !== undefined
          ? env.DISCOVERY_USE_GENERIC_FALLBACK === 'true' ||
            env.DISCOVERY_USE_GENERIC_FALLBACK === '1'
          : defaultCareerOpsConfig.discovery.useGenericHtmlFallback,
      genericExtractionModel:
        env.DISCOVERY_GENERIC_MODEL ?? defaultCareerOpsConfig.discovery.genericExtractionModel,
      browserProfileDir: env.DISCOVERY_BROWSER_PROFILE_DIR
        ? homePath(env.DISCOVERY_BROWSER_PROFILE_DIR)
        : defaultCareerOpsConfig.discovery.browserProfileDir,
      // Boards de ATS: "greenhouse:acme,greenhouse:foo,lever:stripe" →
      // { greenhouse: ['acme','foo'], lever: ['stripe'] }
      atsBoards: env.DISCOVERY_ATS_BOARDS
        ? env.DISCOVERY_ATS_BOARDS.split(/[,;]/)
            .map((e) => e.trim().split(':', 2))
            .filter(([provider, slug]) => Boolean(provider && slug))
            .reduce<Record<string, string[]>>((acc, [provider, slug]) => {
              (acc[provider.toLowerCase()] ??= []).push(slug);
              return acc;
            }, {})
        : defaultCareerOpsConfig.discovery.atsBoards,
      respectRobotsTxt:
        env.DISCOVERY_RESPECT_ROBOTS_TXT !== undefined
          ? env.DISCOVERY_RESPECT_ROBOTS_TXT === 'true' || env.DISCOVERY_RESPECT_ROBOTS_TXT === '1'
          : defaultCareerOpsConfig.discovery.respectRobotsTxt,
    },
    salary: (() => {
      const d = defaultCareerOpsConfig.salary;
      const num = (k: string, def: number) => {
        const v = Number(env[k]);
        return Number.isFinite(v) && env[k] !== undefined ? v : def;
      };
      return {
        adaptToJobRange:
          env.SALARY_ADAPT_TO_RANGE === undefined
            ? d.adaptToJobRange
            : env.SALARY_ADAPT_TO_RANGE === 'true' || env.SALARY_ADAPT_TO_RANGE === '1',
        byLevel: {
          JUNIOR: {
            brl: num('SALARY_BRL_JUNIOR', d.byLevel.JUNIOR.brl),
            usd: num('SALARY_USD_JUNIOR', d.byLevel.JUNIOR.usd),
          },
          PLENO: {
            brl: num('SALARY_BRL_PLENO', d.byLevel.PLENO.brl),
            usd: num('SALARY_USD_PLENO', d.byLevel.PLENO.usd),
          },
          SENIOR: {
            brl: num('SALARY_BRL_SENIOR', d.byLevel.SENIOR.brl),
            usd: num('SALARY_USD_SENIOR', d.byLevel.SENIOR.usd),
          },
        },
      };
    })(),
    marketScope: {
      ...defaultCareerOpsConfig.marketScope,
      national: {
        ...defaultCareerOpsConfig.marketScope.national,
        ...(Number.isFinite(Number(env.SALARY_BRL)) && env.SALARY_BRL !== undefined
          ? { salaryExpectationBRL: Number(env.SALARY_BRL) }
          : {}),
        ...(env.NATIONAL_WORK_MODELS
          ? {
              workModels: env.NATIONAL_WORK_MODELS.split(/[,;]/)
                .map((s) => s.trim().toUpperCase() as WorkModel)
                .filter(Boolean),
            }
          : {}),
        ...(env.ALLOWED_CITIES
          ? {
              allowedCities: env.ALLOWED_CITIES.split(/[,;]/)
                .map((s) => s.trim())
                .filter(Boolean),
            }
          : {}),
      },
      international: {
        ...defaultCareerOpsConfig.marketScope.international,
        ...(Number.isFinite(Number(env.SALARY_USD)) && env.SALARY_USD !== undefined
          ? { salaryExpectationUSD: Number(env.SALARY_USD) }
          : {}),
      },
    },
    ai: (() => {
      const tiers = {
        local: resolveTier('local', env),
        fast: resolveTier('fast', env),
        smart: resolveTier('smart', env),
      };
      const withFallback = (key: 'local' | 'fast' | 'smart'): ModelRouting => ({
        ...tiers[key],
        fallback: resolveFallback(key, env, tiers),
      });
      return {
        local: withFallback('local'),
        fast: withFallback('fast'),
        smart: withFallback('smart'),
        ...(embeddingsEnabled
          ? {
              embeddings: {
                enabled: true,
                modelId: env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text',
              },
            }
          : {}),
      };
    })(),
    profile: {
      inboxDir: homePath(env.PROFILE_INBOX_DIR ?? defaultCareerOpsConfig.profile.inboxDir),
      draftPath: homePath(env.PROFILE_DRAFT_PATH ?? defaultCareerOpsConfig.profile.draftPath),
      masterPath: homePath(env.PROFILE_MASTER_PATH ?? defaultCareerOpsConfig.profile.masterPath),
      compiledPath: homePath(
        env.PROFILE_COMPILED_PATH ?? defaultCareerOpsConfig.profile.compiledPath,
      ),
      historyDir: homePath(env.PROFILE_HISTORY_DIR ?? defaultCareerOpsConfig.profile.historyDir),
    },
    email: {
      ...defaultCareerOpsConfig.email,
      ...(env.EMAIL_ENABLED !== undefined
        ? { enabled: env.EMAIL_ENABLED === 'true' || env.EMAIL_ENABLED === '1' }
        : {}),
      ...(env.EMAIL_DISPATCH_MODE
        ? { dispatchMode: env.EMAIL_DISPATCH_MODE as EmailDispatchMode }
        : {}),
      ...(env.EMAIL_MIN_SCORE_AUTO_SEND
        ? { minScoreAutoSend: Number(env.EMAIL_MIN_SCORE_AUTO_SEND) }
        : {}),
      ...(env.EMAIL_MAX_DAILY ? { maxDailyEmails: Number(env.EMAIL_MAX_DAILY) } : {}),
      ...(env.EMAIL_SMTP_CREDENTIAL_REF
        ? { smtpCredentialRef: env.EMAIL_SMTP_CREDENTIAL_REF }
        : {}),
      ...(env.EMAIL_COOLDOWN_DAYS
        ? { recipientCooldownDays: Number(env.EMAIL_COOLDOWN_DAYS) }
        : {}),
      ...(env.EMAIL_RETRY_MAX ? { maxRetries: Number(env.EMAIL_RETRY_MAX) } : {}),
      ...(env.EMAIL_RETRY_BACKOFF_MS ? { retryBackoffMs: Number(env.EMAIL_RETRY_BACKOFF_MS) } : {}),
      ...(env.EMAIL_TEMPLATE_PATH
        ? { bodyTemplatePath: homePath(env.EMAIL_TEMPLATE_PATH) }
        : { bodyTemplatePath: homePath(defaultCareerOpsConfig.email.bodyTemplatePath) }),
      ...(env.EMAIL_INCLUDE_SALARY !== undefined
        ? {
            includeSalaryExpectation:
              env.EMAIL_INCLUDE_SALARY === 'true' || env.EMAIL_INCLUDE_SALARY === '1',
          }
        : {}),
    },
    whatsapp: {
      ...defaultCareerOpsConfig.whatsapp,
      ...(env.WHATSAPP_ENABLED !== undefined
        ? { enabled: env.WHATSAPP_ENABLED === 'true' || env.WHATSAPP_ENABLED === '1' }
        : {}),
      ...(env.WHATSAPP_MODE ? { mode: env.WHATSAPP_MODE as WhatsappMode } : {}),
      ...(env.WHATSAPP_TEMPLATE_PATH
        ? { bodyTemplatePath: homePath(env.WHATSAPP_TEMPLATE_PATH) }
        : { bodyTemplatePath: homePath(defaultCareerOpsConfig.whatsapp.bodyTemplatePath) }),
      ...(env.WHATSAPP_COOLDOWN_DAYS
        ? { recipientCooldownDays: Number(env.WHATSAPP_COOLDOWN_DAYS) }
        : {}),
      ...(env.WHATSAPP_ATTACH_RESUME !== undefined
        ? {
            attachResume:
              env.WHATSAPP_ATTACH_RESUME === 'true' || env.WHATSAPP_ATTACH_RESUME === '1',
          }
        : {}),
      ...(env.WHATSAPP_RETRY_MAX ? { maxRetries: Number(env.WHATSAPP_RETRY_MAX) } : {}),
      ...(env.WHATSAPP_RETRY_BACKOFF_MS
        ? { retryBackoffMs: Number(env.WHATSAPP_RETRY_BACKOFF_MS) }
        : {}),
      ...(env.EVOLUTION_API_URL ? { apiUrlEnv: 'EVOLUTION_API_URL' } : {}),
      ...(env.EVOLUTION_INSTANCE ? { apiInstance: env.EVOLUTION_INSTANCE } : {}),
    },
  };
}
