import type { CareerOpsConfig, ModelRouting } from '../config/careerOps.config';
import type { EnvMap } from '../config/loadConfig';

export type TierKey = 'local' | 'fast' | 'smart';

export type PreflightStatus =
  | 'ok'
  | 'offline'
  | 'http_error'
  | 'missing_key'
  | 'model_missing'
  | 'skipped'
  | 'adapter_pending';

export interface ProviderCheckResult {
  tier: TierKey;
  routing: ModelRouting;
  status: PreflightStatus;
  /** Motivo curto p/ exibir (ex.: 'HTTP 401', 'GROQ_API_KEY ausente'). */
  detail?: string;
  latencyMs?: number;
  /** Adapter de geração já implementado no codebase? Hoje só 'ollama'. */
  adapterImplemented: boolean;
}

export interface PreflightDeps {
  fetchImpl?: typeof fetch;
  env?: EnvMap;
  /** Desliga tudo — AI_PREFLIGHT_ENABLED=false. */
  enabled?: boolean;
  /** Default 8000; env AI_PREFLIGHT_TIMEOUT_MS sobrescreve. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

const GENERATION_ADAPTERS = new Set(['ollama']);

/** Endpoint de listagem de modelos + auth por provider conhecido. */
const DEFAULT_ENDPOINTS: Record<
  string,
  { base: string; path: string; headers: (key: string) => Record<string, string> }
> = {
  groq: {
    base: 'https://api.groq.com',
    path: '/openai/v1/models',
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
  },
  openai: {
    base: 'https://api.openai.com',
    path: '/v1/models',
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
  },
  anthropic: {
    base: 'https://api.anthropic.com',
    path: '/v1/models',
    headers: (k) => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }),
  },
  kimi: {
    base: 'https://api.moonshot.ai',
    path: '/v1/models',
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
  },
  moonshot: {
    base: 'https://api.moonshot.ai',
    path: '/v1/models',
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
  },
};

/**
 * Monta o probe GET para o provider. null = não faz sentido chamar
 * (chave obrigatória ausente ou provider desconhecido sem baseUrl).
 */
function probeFor(
  routing: ModelRouting,
  apiKey: string | undefined,
): { url: string; headers: Record<string, string> } | null {
  const p = routing.provider;
  const strip = (u: string) => u.replace(/\/$/, '');
  if (p === 'ollama') {
    return {
      url: `${strip(routing.baseUrl ?? 'http://localhost:11434')}/api/tags`,
      headers: {},
    };
  }
  if (p === 'gemini' || p === 'google') {
    if (!apiKey) return null;
    return {
      url: `${strip(routing.baseUrl ?? 'https://generativelanguage.googleapis.com')}/v1beta/models?key=${apiKey}`,
      headers: {},
    };
  }
  const entry = DEFAULT_ENDPOINTS[p];
  if (entry) {
    if (!apiKey) return null;
    return { url: `${strip(routing.baseUrl ?? entry.base)}${entry.path}`, headers: entry.headers(apiKey) };
  }
  if (routing.baseUrl) {
    return {
      url: `${strip(routing.baseUrl)}/models`,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    };
  }
  return null;
}

/** Modelo instalado no Ollama? Compara nome exato e com sufixo :latest implícito. */
function ollamaHasModel(models: { name?: string }[], wanted: string): boolean {
  const target = wanted.includes(':') ? wanted : `${wanted}:latest`;
  return models.some((m) => m.name === target || m.name === wanted);
}

export async function checkProvider(
  tier: TierKey,
  routing: ModelRouting,
  deps: PreflightDeps = {},
): Promise<ProviderCheckResult> {
  const env = deps.env ?? process.env;
  const base: ProviderCheckResult = {
    tier,
    routing,
    status: 'skipped',
    adapterImplemented: GENERATION_ADAPTERS.has(routing.provider),
  };
  if (deps.enabled === false) return base;

  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiKey = routing.apiKeyEnv ? env[routing.apiKeyEnv] : undefined;
  if (routing.apiKeyEnv && !apiKey) {
    return { ...base, status: 'missing_key', detail: `${routing.apiKeyEnv} ausente` };
  }
  const req = probeFor(routing, apiKey);
  if (!req) {
    return routing.apiKeyEnv
      ? { ...base, status: 'missing_key', detail: `${routing.apiKeyEnv} ausente` }
      : { ...base, status: 'skipped', detail: 'sem endpoint conhecido' };
  }

  const envTimeout = Number(env.AI_PREFLIGHT_TIMEOUT_MS);
  const timeoutMs = deps.timeoutMs ?? (Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : 8_000);
  const t0 = Date.now();
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (deps.signal) signals.push(deps.signal);

  let res: Response;
  try {
    res = await fetchImpl(req.url, { headers: req.headers, signal: AbortSignal.any(signals) });
  } catch {
    return { ...base, status: 'offline', detail: req.url, latencyMs: Date.now() - t0 };
  }
  const latencyMs = Date.now() - t0;

  if (!res.ok) {
    const hint =
      res.status === 401 || res.status === 403 ? 'chave inválida ou sem permissão' : '';
    return {
      ...base,
      status: 'http_error',
      detail: `HTTP ${res.status}${hint ? ` — ${hint}` : ''}`,
      latencyMs,
    };
  }

  if (routing.provider === 'ollama') {
    const data = (await res.json().catch(() => ({}))) as { models?: { name?: string }[] };
    if (!ollamaHasModel(data.models ?? [], routing.modelId)) {
      return {
        ...base,
        status: 'model_missing',
        detail: `rode 'ollama pull ${routing.modelId.includes(':') ? routing.modelId : `${routing.modelId}:latest`}'`,
        latencyMs,
      };
    }
  }
  return { ...base, status: 'ok', latencyMs };
}

export async function checkProviders(
  config: CareerOpsConfig,
  tiers: TierKey[],
  deps: PreflightDeps = {},
): Promise<ProviderCheckResult[]> {
  const env = deps.env ?? process.env;
  const enabled =
    deps.enabled ?? (env.AI_PREFLIGHT_ENABLED !== 'false' && env.AI_PREFLIGHT_ENABLED !== '0');
  return Promise.all(
    tiers.map((tier) => checkProvider(tier, config.ai[tier], { ...deps, env, enabled })),
  );
}
