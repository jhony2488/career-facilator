import type { OllamaCallStats, OllamaChatOptions, OllamaMessage } from './ollamaClient';

/**
 * Client genérico para APIs OpenAI-compatíveis (`/chat/completions`) —
 * cobre OpenAI, DeepSeek, Groq, Kimi/Moonshot, OpenRouter, Together e
 * gateways com baseUrl custom. Duck-type do OllamaClient: o modelFactory
 * consome a mesma superfície (format, onToken/onThought/onDone, timeout).
 */

/** Base URL default por provider quando nem {P}_BASE_URL nem AI_<T>_BASE_URL vieram. */
export const OPENAI_COMPAT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  deepseek: 'https://api.deepseek.com',
  kimi: 'https://api.moonshot.ai/v1',
  moonshot: 'https://api.moonshot.ai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  openrouter: 'https://openrouter.ai/api/v1',
  together: 'https://api.together.xyz/v1',
};

export interface OpenAIClientDeps {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  /** Injetável para testes — default: fetch nativo. */
  fetchImpl?: typeof fetch;
}

export interface OpenAICompatibleClient {
  chat(model: string, messages: OllamaMessage[], opts?: OllamaChatOptions): Promise<string>;
  embed(model: string, texts: string[]): Promise<number[][]>;
  isReachable(): Promise<boolean>;
  listModels(): Promise<string[]>;
  listLoadedModels(): Promise<string[]>;
  capabilities(model: string): Promise<string[]>;
}

const DEFAULT_TIMEOUT_MS = 600_000;

interface ChatBody {
  model: string;
  messages: OllamaMessage[];
  stream: boolean;
  temperature?: number;
  max_tokens?: number;
  stream_options?: { include_usage: boolean };
  response_format?: Record<string, unknown>;
}

/** Traduz as options estilo Ollama (num_predict etc.) para OpenAI. */
function translateOptions(options?: Record<string, unknown>): Partial<ChatBody> {
  const out: Partial<ChatBody> = {};
  if (!options) return out;
  const maxTokens = Number(options.num_predict);
  if (Number.isFinite(maxTokens) && maxTokens > 0) out.max_tokens = maxTokens;
  const temperature = Number(options.temperature);
  if (Number.isFinite(temperature)) out.temperature = temperature;
  return out;
}

/** format schema → response_format; 'json' simples → json_object. */
function responseFormat(
  format?: 'json' | Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (format === undefined) return undefined;
  if (format === 'json') return { type: 'json_object' };
  return {
    type: 'json_schema',
    json_schema: { name: 'output', schema: format, strict: true },
  };
}

export function createOpenAIClient(deps: OpenAIClientDeps = {}): OpenAICompatibleClient {
  const provider = deps.provider ?? 'openai-compat';
  const resolved = deps.baseUrl ?? OPENAI_COMPAT_BASE_URLS[provider];
  if (!resolved) {
    throw new Error(
      `Provider '${provider}' não tem endpoint default — defina ${provider.toUpperCase()}_BASE_URL.`,
    );
  }
  const baseUrl = resolved.replace(/\/$/, '');
  const fetchImpl = deps.fetchImpl ?? fetch;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (deps.apiKey) headers.Authorization = `Bearer ${deps.apiKey}`;

  function signals(opts: OllamaChatOptions): AbortSignal {
    const list = [AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)];
    if (opts.signal) list.push(opts.signal);
    return AbortSignal.any(list);
  }

  async function post(body: ChatBody, opts: OllamaChatOptions): Promise<Response> {
    return fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      signal: signals(opts),
      body: JSON.stringify(body),
    });
  }

  async function chat(
    model: string,
    messages: OllamaMessage[],
    opts: OllamaChatOptions = {},
  ): Promise<string> {
    const stream = opts.stream ?? (opts.onToken !== undefined || opts.onThought !== undefined);
    const t0 = Date.now();
    const body: ChatBody = {
      model,
      messages,
      stream,
      ...translateOptions(opts.options),
      ...(responseFormat(opts.format) ? { response_format: responseFormat(opts.format) } : {}),
      ...(stream ? { stream_options: { include_usage: true } } : {}),
    };
    // 'think' não existe no protocolo OpenAI — modelos com raciocínio
    // (deepseek-reasoner) devolvem reasoning_content por conta própria.

    let res = await post(body, opts);
    if (!res.ok) {
      // Provider sem json_schema/stream_options → degrada e tenta de novo.
      if (res.status === 400) {
        const degraded = { ...body };
        if (body.response_format?.type === 'json_schema') {
          degraded.response_format = { type: 'json_object' };
          res = await post(degraded, opts);
        }
        if (!res.ok && res.status === 400 && body.stream_options) {
          delete degraded.stream_options;
          res = await post(degraded, opts);
        }
      }
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `${provider} /chat/completions falhou (HTTP ${res.status}): ${text.slice(0, 300)}`,
      );
    }

    if (!stream) {
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const usage = data.usage;
      opts.onDone?.({
        totalDurationMs: Date.now() - t0,
        promptTokens: usage?.prompt_tokens,
        outputTokens: usage?.completion_tokens,
        evalDurationMs: Date.now() - t0,
      });
      return data.choices?.[0]?.message?.content ?? '';
    }

    if (!res.body) throw new Error(`${provider}: resposta sem body para streaming`);
    return readSseStream(res.body, t0, opts);
  }

  async function embed(model: string, texts: string[]): Promise<number[][]> {
    const res = await fetchImpl(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, input: texts }),
    });
    if (!res.ok) throw new Error(`${provider} /embeddings falhou (HTTP ${res.status})`);
    const data = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    return (data.data ?? []).map((d) => d.embedding ?? []);
  }

  async function modelIds(): Promise<string[]> {
    try {
      const res = await fetchImpl(`${baseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { data?: Array<{ id?: string }> };
      return (data.data ?? []).map((m) => m.id ?? '').filter(Boolean);
    } catch {
      return [];
    }
  }

  async function isReachable(): Promise<boolean> {
    try {
      const res = await fetchImpl(`${baseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(3_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  return {
    chat,
    embed,
    isReachable,
    listModels: modelIds,
    listLoadedModels: () => Promise.resolve([]),
    capabilities: () => Promise.resolve([]),
  };
}

/** SSE OpenAI: linhas `data: {json}`, terminadas por `data: [DONE]`. */
async function readSseStream(
  body: ReadableStream<Uint8Array>,
  t0: number,
  opts: OllamaChatOptions,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  const stats: OllamaCallStats = {};

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line || !line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const chunk = JSON.parse(payload) as {
          choices?: Array<{
            delta?: { content?: string; reasoning_content?: string };
          }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        if (chunk.usage) {
          stats.promptTokens = chunk.usage.prompt_tokens;
          stats.outputTokens = chunk.usage.completion_tokens;
        }
        const delta = chunk.choices?.[0]?.delta;
        const thought = delta?.reasoning_content ?? '';
        if (thought) opts.onThought?.(thought);
        const piece = delta?.content ?? '';
        if (piece) {
          content += piece;
          opts.onToken?.(piece);
        }
      } catch {
        // chunk parcial/corrompido — ignora
      }
    }
  }
  stats.totalDurationMs = Date.now() - t0;
  stats.evalDurationMs = stats.totalDurationMs;
  opts.onDone?.(stats);
  return content;
}
