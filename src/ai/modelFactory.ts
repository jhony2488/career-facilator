import { createOllamaClient, type OllamaClient, type OllamaMessage } from './ollamaClient';
import { generateStructured } from './jsonRepair';
import { resolveModel } from './router';
import type { TriageModel, JobTriageResult } from './triageAgent';
import { JobTriageSchema } from './triageAgent';
import type { TailorModel } from './tailorerAgent';
import type { StructurerModel } from '../intake/profileStructurer';
import { MasterProfileSchema } from '../intake/profileStructurer';
import { z } from 'zod';
import type { CareerOpsConfig, ModelRouting } from '../config/careerOps.config';

export interface LlmClients {
  triageModel: TriageModel;
  tailorModel: TailorModel;
  structurerModel: StructurerModel;
}

/** Métricas normalizadas de uma chamada de modelo — agnóstico de provider. */
export interface ModelCallStats {
  stage: 'triage' | 'structurer' | 'tailor';
  provider: string;
  modelId: string;
  durationMs?: number;
  loadDurationMs?: number;
  promptTokens?: number;
  outputTokens?: number;
  tokensPerSecond?: number;
}

export interface ModelFactoryOptions {
  /** Callback por token — streaming exposto ao consumidor (CLI/UI). */
  onToken?: (token: string) => void;
  /** Callback por token de raciocínio (modelos thinking — deepseek-r1, qwen3…). */
  onThought?: (token: string) => void;
  /** Callback ao fim de cada chamada com métricas normalizadas. */
  onStage?: (stats: ModelCallStats) => void;
  /** Cancelamento externo (ex.: Ctrl+C no CLI) — aplicado a todas as chamadas. */
  signal?: AbortSignal;
  /** Overrides do ollamaClient (baseUrl, keepAlive, fetchImpl p/ testes). */
  ollama?: Parameters<typeof createOllamaClient>[0];
  /** Roteamento efetivo por tier (ex.: fallback escolhido no preflight) — sobrescreve config.ai. */
  overrides?: Partial<Record<'local' | 'fast' | 'smart', ModelRouting>>;
}

const TailorOutputSchema = z.object({
  resumeMarkdown: z.string().min(1),
  answers: z.record(z.string(), z.string()),
});

export class ProviderNotImplementedError extends Error {
  constructor(provider: string, tier: string) {
    super(
      `Provider '${provider}' (tier ${tier}) ainda não implementado. ` +
        `Use AI_${tier}_PROVIDER=ollama ou contribua um adapter.`,
    );
    this.name = 'ProviderNotImplementedError';
  }
}

function ollamaOptions(env: Record<string, string | undefined>): Record<string, unknown> | undefined {
  const opts: Record<string, unknown> = {};
  const temperature = Number(env.AI_TEMPERATURE);
  const numPredict = Number(env.AI_NUM_PREDICT);
  if (Number.isFinite(temperature)) opts.temperature = temperature;
  if (Number.isFinite(numPredict) && numPredict > 0) opts.num_predict = numPredict;
  return Object.keys(opts).length ? opts : undefined;
}

/**
 * Teto de saída por chamada — sem cap, um 3B pode divagar indefinidamente.
 * `AI_NUM_PREDICT` na env sobrescreve todos.
 */
const NUM_PREDICT_DEFAULTS = { triage: 512, structurer: 3072, tailor: 4096 } as const;
const DEFAULT_TIMEOUT_MS = 180_000;

function callOptions(
  env: Record<string, string | undefined>,
  numPredict: number,
): { options?: Record<string, unknown>; timeoutMs: number } {
  const base = ollamaOptions(env) ?? {};
  const envTimeout = Number(env.AI_TIMEOUT_MS);
  return {
    options: { ...base, num_predict: base.num_predict ?? numPredict },
    timeoutMs: Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : DEFAULT_TIMEOUT_MS,
  };
}

/**
 * Fábrica de adapters de modelo por provider/tier (doc 02/03).
 * Ollama: client real com format:'json' + jsonRepair + streaming via onToken.
 * Demais providers: erro explícito — metadados do router já resolvidos.
 */
export function createModelClients(
  config: CareerOpsConfig,
  opts: ModelFactoryOptions = {},
  env: Record<string, string | undefined> = process.env,
): LlmClients {
  const local = opts.overrides?.local ?? resolveModel('LOCAL', config);
  const smart = opts.overrides?.smart ?? resolveModel('SMART', config);

  const ollamaFor = (routing: { provider: string; baseUrl?: string }, tier: string): OllamaClient => {
    if (routing.provider !== 'ollama') throw new ProviderNotImplementedError(routing.provider, tier);
    return createOllamaClient({
      baseUrl: routing.baseUrl,
      keepAlive: env.OLLAMA_KEEP_ALIVE,
      ...opts.ollama,
    });
  };

  const chatText = async (
    client: OllamaClient,
    modelId: string,
    prompt: string,
    extra: { format?: 'json' | Record<string, unknown>; numPredict: number },
    stage?: ModelCallStats['stage'],
    provider = 'ollama',
  ): Promise<string> => {
    const messages: OllamaMessage[] = [{ role: 'user', content: prompt }];
    const call = callOptions(env, extra.numPredict);
    const t0 = Date.now();
    const content = await client.chat(modelId, messages, {
      format: extra.format,
      options: call.options,
      timeoutMs: call.timeoutMs,
      signal: opts.signal,
      think: env.AI_THINK_ENABLED === 'true' || opts.onThought !== undefined,
      onToken: opts.onToken,
      onThought: opts.onThought,
      onDone: (s) => {
        const durationMs = s.totalDurationMs ?? Date.now() - t0;
        const evalMs = s.evalDurationMs;
        opts.onStage?.({
          stage: stage ?? 'triage',
          provider,
          modelId,
          durationMs,
          loadDurationMs: s.loadDurationMs,
          promptTokens: s.promptTokens,
          outputTokens: s.outputTokens,
          tokensPerSecond:
            evalMs && s.outputTokens ? Math.round(s.outputTokens / (evalMs / 1000)) : undefined,
        });
      },
    });
    return content;
  };

  const triageModel: TriageModel =
    local.provider === 'ollama'
      ? (() => {
          const client = ollamaFor(local, 'LOCAL');
          return {
            generate: (prompt: string) =>
              generateStructured(
                (p) =>
                  chatText(client, local.modelId, p, {
                    format: 'json',
                    numPredict: NUM_PREDICT_DEFAULTS.triage,
                  }, 'triage', local.provider),
                prompt,
                JobTriageSchema,
              ) as Promise<JobTriageResult>,
          };
        })()
      : { generate: () => Promise.reject(new ProviderNotImplementedError(local.provider, 'LOCAL')) };

  const structurerModel: StructurerModel =
    smart.provider === 'ollama'
      ? (() => {
          const client = ollamaFor(smart, 'SMART');
          return {
            generate: (prompt: string) =>
              generateStructured(
                (p) =>
                  chatText(client, smart.modelId, p, {
                    format: 'json',
                    numPredict: NUM_PREDICT_DEFAULTS.structurer,
                  }, 'structurer', smart.provider),
                prompt,
                MasterProfileSchema,
              ),
          };
        })()
      : { generate: () => Promise.reject(new ProviderNotImplementedError(smart.provider, 'SMART')) };

  const tailorModel: TailorModel =
    smart.provider === 'ollama'
      ? (() => {
          const client = ollamaFor(smart, 'SMART');
          return {
            tailor: async (prompt: string) => {
              const guided = [
                prompt,
                '',
                'Respond with a JSON object only:',
                '{"resumeMarkdown": "<markdown completo do currículo>", "answers": {"<pergunta>": "<resposta>"}}',
              ].join('\n');
              return generateStructured(
                (p) =>
                  chatText(client, smart.modelId, p, {
                    format: 'json',
                    numPredict: NUM_PREDICT_DEFAULTS.tailor,
                  }, 'tailor', smart.provider),
                guided,
                TailorOutputSchema,
              );
            },
          };
        })()
      : { tailor: () => Promise.reject(new ProviderNotImplementedError(smart.provider, 'SMART')) };

  return { triageModel, tailorModel, structurerModel };
}

/** Embedder para o retriever híbrido — provider ollama via /api/embed. */
export function createEmbedder(
  config: CareerOpsConfig,
  opts: { baseUrl?: string } = {},
): { embed(texts: string[]): Promise<number[][]> } | undefined {
  if (!config.ai.embeddings?.enabled) return undefined;
  const client = createOllamaClient({ baseUrl: opts.baseUrl ?? 'http://localhost:11434' });
  const model = config.ai.embeddings.modelId;
  return { embed: (texts) => client.embed(model, texts) };
}
