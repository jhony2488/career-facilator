import { createOllamaClient, type OllamaClient, type OllamaMessage } from './ollamaClient';
import { generateStructured } from './jsonRepair';
import { resolveModel } from './router';
import type { TriageModel, JobTriageResult } from './triageAgent';
import { JobTriageSchema } from './triageAgent';
import type { TailorModel } from './tailorerAgent';
import type { StructurerModel } from '../intake/profileStructurer';
import { MasterProfileSchema } from '../intake/profileStructurer';
import { z } from 'zod';
import type { CareerOpsConfig } from '../config/careerOps.config';

export interface LlmClients {
  triageModel: TriageModel;
  tailorModel: TailorModel;
  structurerModel: StructurerModel;
}

export interface ModelFactoryOptions {
  /** Callback por token — streaming exposto ao consumidor (CLI/UI). */
  onToken?: (token: string) => void;
  /** Overrides do ollamaClient (baseUrl, keepAlive, fetchImpl p/ testes). */
  ollama?: Parameters<typeof createOllamaClient>[0];
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
  if (env.AI_TEMPERATURE) opts.temperature = Number(env.AI_TEMPERATURE);
  if (env.AI_NUM_PREDICT) opts.num_predict = Number(env.AI_NUM_PREDICT);
  return Object.keys(opts).length ? opts : undefined;
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
  const local = resolveModel('LOCAL', config);
  const smart = resolveModel('SMART', config);
  const genOpts = ollamaOptions(env);

  const ollamaFor = (routing: { provider: string; baseUrl?: string }): OllamaClient => {
    if (routing.provider !== 'ollama') throw new ProviderNotImplementedError(routing.provider, 'LOCAL');
    return createOllamaClient({ baseUrl: routing.baseUrl, ...opts.ollama });
  };

  const chatText = async (
    client: OllamaClient,
    modelId: string,
    prompt: string,
    extra: { format?: 'json' | Record<string, unknown> } = {},
  ): Promise<string> => {
    const messages: OllamaMessage[] = [{ role: 'user', content: prompt }];
    return client.chat(modelId, messages, {
      format: extra.format,
      options: genOpts,
      onToken: opts.onToken,
    });
  };

  const triageModel: TriageModel =
    local.provider === 'ollama'
      ? (() => {
          const client = ollamaFor(local);
          return {
            generate: (prompt: string) =>
              generateStructured(
                (p) => chatText(client, local.modelId, p, { format: 'json' }),
                prompt,
                JobTriageSchema,
              ) as Promise<JobTriageResult>,
          };
        })()
      : { generate: () => Promise.reject(new ProviderNotImplementedError(local.provider, 'LOCAL')) };

  const structurerModel: StructurerModel =
    smart.provider === 'ollama'
      ? (() => {
          const client = ollamaFor(smart);
          return {
            generate: (prompt: string) =>
              generateStructured(
                (p) => chatText(client, smart.modelId, p, { format: 'json' }),
                prompt,
                MasterProfileSchema,
              ),
          };
        })()
      : { generate: () => Promise.reject(new ProviderNotImplementedError(smart.provider, 'SMART')) };

  const tailorModel: TailorModel =
    smart.provider === 'ollama'
      ? (() => {
          const client = ollamaFor(smart);
          return {
            tailor: async (prompt: string) => {
              const guided = [
                prompt,
                '',
                'Respond with a JSON object only:',
                '{"resumeMarkdown": "<markdown completo do currículo>", "answers": {"<pergunta>": "<resposta>"}}',
              ].join('\n');
              return generateStructured(
                (p) => chatText(client, smart.modelId, p, { format: 'json' }),
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
