import { createOllamaClient, type OllamaClient, type OllamaMessage } from './ollamaClient';
import { createOpenAIClient, type OpenAICompatibleClient } from './openaiCompatibleClient';
import { generateStructured } from './jsonRepair';
import { resolveModel } from './router';
import type { TriageModel, JobTriageResult } from './triageAgent';
import { JobTriageSchema } from './triageAgent';
import type { TailorModel } from './tailorerAgent';
import type { StructurerModel } from '../intake/profileStructurer';
import { MasterProfileSchema } from '../intake/profileStructurer';
import { z } from 'zod';
import { zodSchema } from 'ai';
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
  /** Overrides do client OpenAI-compatible (fetchImpl p/ testes). */
  openai?: Parameters<typeof createOpenAIClient>[0];
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

function ollamaOptions(
  env: Record<string, string | undefined>,
): Record<string, unknown> | undefined {
  const opts: Record<string, unknown> = {};
  const temperature = Number(env.AI_TEMPERATURE);
  const numPredict = Number(env.AI_NUM_PREDICT);
  const numCtx = Number(env.AI_NUM_CTX);
  if (Number.isFinite(temperature)) opts.temperature = temperature;
  if (Number.isFinite(numPredict) && numPredict > 0) opts.num_predict = numPredict;
  if (Number.isFinite(numCtx) && numCtx > 0) opts.num_ctx = numCtx;
  return Object.keys(opts).length ? opts : undefined;
}

/**
 * Teto de saída por chamada — sem cap, um 3B pode divagar indefinidamente.
 * `AI_NUM_PREDICT` na env sobrescreve todos.
 */
const NUM_PREDICT_DEFAULTS = { triage: 512, structurer: 3072, tailor: 4096 } as const;

/**
 * Structured outputs do Ollama: passar o JSON Schema em `format` força a
 * decodificação a obedecer o shape (gramática) — muito mais confiável que
 * 'json' genérico para modelos pequenos.
 */
const TRIAGE_JSON_SCHEMA = zodSchema(JobTriageSchema).jsonSchema as Record<string, unknown>;
const PROFILE_JSON_SCHEMA = zodSchema(MasterProfileSchema).jsonSchema as Record<string, unknown>;
const TAILOR_JSON_SCHEMA = zodSchema(TailorOutputSchema).jsonSchema as Record<string, unknown>;
/** Timeout por chamada — 10 min: modelos 7-8B em CPU demoram muito além de 3 min. */
const DEFAULT_TIMEOUT_MS = 600_000;

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

/** Superfície de chat consumida pelo factory — Ollama e OpenAI-compatíveis. */
type ChatClient = OllamaClient | OpenAICompatibleClient;

/**
 * Fábrica de adapters de modelo por provider/tier (doc 02/03).
 * Ollama: client real com format:'json' + jsonRepair + streaming via onToken.
 * Demais providers: client OpenAI-compatible genérico (chat/completions).
 */
export function createModelClients(
  config: CareerOpsConfig,
  opts: ModelFactoryOptions = {},
  env: Record<string, string | undefined> = process.env,
): LlmClients {
  const local = opts.overrides?.local ?? resolveModel('LOCAL', config);
  const smart = opts.overrides?.smart ?? resolveModel('SMART', config);

  const clientFor = (
    routing: { provider: string; baseUrl?: string; apiKeyEnv?: string },
    tier: string,
  ): ChatClient => {
    if (routing.provider === 'ollama') {
      return createOllamaClient({
        baseUrl: routing.baseUrl,
        keepAlive: env.OLLAMA_KEEP_ALIVE,
        ...opts.ollama,
      });
    }
    try {
      return createOpenAIClient({
        provider: routing.provider,
        baseUrl: routing.baseUrl,
        apiKey: routing.apiKeyEnv ? env[routing.apiKeyEnv] : undefined,
        ...opts.openai,
      });
    } catch (e) {
      throw new ProviderNotImplementedError(
        routing.provider,
        `${tier}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };

  const chatText = async (
    client: ChatClient,
    modelId: string,
    prompt: string,
    extra: { format?: 'json' | Record<string, unknown>; numPredict: number },
    stage?: ModelCallStats['stage'],
    provider = 'ollama',
  ): Promise<string> => {
    const messages: OllamaMessage[] = [{ role: 'user', content: prompt }];
    const call = callOptions(env, extra.numPredict);
    const t0 = Date.now();
    // think só se o modelo suportar (capabilities do /api/show); capacidade
    // desconhecida (lista vazia) → tenta otimista e faz retry sem think no
    // 400 "does not support thinking" que o Ollama devolve.
    const wantThink = env.AI_THINK_ENABLED === 'true' || opts.onThought !== undefined;
    const caps = wantThink ? await client.capabilities(modelId) : [];
    const think = wantThink && (caps.length === 0 || caps.includes('thinking'));
    const doChat = (useThink: boolean) =>
      client.chat(modelId, messages, {
        format: extra.format,
        options: call.options,
        timeoutMs: call.timeoutMs,
        signal: opts.signal,
        think: useThink,
        onToken: opts.onToken,
        onThought: useThink ? opts.onThought : undefined,
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
    const content = await doChat(think).catch((err) =>
      think && err instanceof Error && err.message.includes('does not support thinking')
        ? doChat(false)
        : Promise.reject(err),
    );
    return content;
  };

  const triageModel: TriageModel = (() => {
    const client = clientFor(local, 'LOCAL');
    return {
      generate: (prompt: string) =>
        generateStructured(
          (p) =>
            chatText(
              client,
              local.modelId,
              p,
              {
                format: TRIAGE_JSON_SCHEMA,
                numPredict: NUM_PREDICT_DEFAULTS.triage,
              },
              'triage',
              local.provider,
            ),
          prompt,
          JobTriageSchema,
        ) as Promise<JobTriageResult>,
    };
  })();

  const structurerModel: StructurerModel = (() => {
    const client = clientFor(smart, 'SMART');
    return {
      generate: (prompt: string) =>
        generateStructured(
          (p) =>
            chatText(
              client,
              smart.modelId,
              p,
              {
                format: PROFILE_JSON_SCHEMA,
                numPredict: NUM_PREDICT_DEFAULTS.structurer,
              },
              'structurer',
              smart.provider,
            ),
          prompt,
          MasterProfileSchema,
        ),
      /**
       * Saída parcial por seção — o adapter traduz `jsonSchema` para o
       * "structured output" do provider (Ollama: format; OpenAI:
       * response_format.json_schema; Anthropic: tool/schema).
       */
      generatePart: (prompt: string, jsonSchema: Record<string, unknown>) =>
        generateStructured(
          (p) =>
            chatText(
              client,
              smart.modelId,
              p,
              {
                format: jsonSchema,
                numPredict: NUM_PREDICT_DEFAULTS.structurer,
              },
              'structurer',
              smart.provider,
            ),
          prompt,
          z.unknown(),
        ),
    };
  })();

  const tailorModel: TailorModel = (() => {
    const client = clientFor(smart, 'SMART');
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
            chatText(
              client,
              smart.modelId,
              p,
              {
                format: TAILOR_JSON_SCHEMA,
                numPredict: NUM_PREDICT_DEFAULTS.tailor,
              },
              'tailor',
              smart.provider,
            ),
          guided,
          TailorOutputSchema,
        );
      },
    };
  })();

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
