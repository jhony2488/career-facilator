import { Agent } from 'undici';

/**
 * Client Ollama real — HTTP via fetch nativo (Node 22+).
 * Suporta geração de chat com/sem streaming (NDJSON), format:json para saída
 * estruturada de modelos pequenos, embeddings e keep-alive.
 */

/**
 * Undici default: headersTimeout=300s. Em CPU um 3-8B pode ficar >5min em
 * fila/prompt-eval antes do 1º byte — sobe pra 10min (AbortSignal continua
 * governando o total).
 */
const agent = new Agent({ headersTimeout: 600_000, bodyTimeout: 0 });
const withDispatcher = (init: RequestInit): RequestInit =>
  Object.assign(init, { dispatcher: agent });

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Métricas reais devolvidas pelo Ollama no fim de cada chamada (chunk done / resposta). */
export interface OllamaCallStats {
  totalDurationMs?: number;
  loadDurationMs?: number;
  promptTokens?: number;
  promptEvalDurationMs?: number;
  outputTokens?: number;
  evalDurationMs?: number;
}

export interface OllamaChatOptions {
  /** 'json' força saída JSON válida; objeto = JSON schema (Ollama ≥ 0.5). */
  format?: 'json' | Record<string, unknown>;
  /** num_predict, temperature, etc. — repassados direto ao Ollama. */
  options?: Record<string, unknown>;
  /** Tempo que o modelo fica em memória (ex.: '10m', '-1' = nunca, '0' = descarrega). */
  keepAlive?: string;
  stream?: boolean;
  /** 'think: true' no Ollama — pede o canal de raciocínio (deepseek-r1, qwen3…). */
  think?: boolean;
  /** Callback por token — expõe streaming ao consumidor (CLI/UI). */
  onToken?: (token: string) => void;
  /** Callback por token de raciocínio (canal `thinking` do chunk). */
  onThought?: (token: string) => void;
  /** Callback com as métricas da chamada ao fim (tokens, durações, carga). */
  onDone?: (stats: OllamaCallStats) => void;
  /** Cancelamento externo (ex.: Ctrl+C no CLI) — combinado com o timeout. */
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface OllamaClient {
  chat(model: string, messages: OllamaMessage[], opts?: OllamaChatOptions): Promise<string>;
  embed(model: string, texts: string[]): Promise<number[][]>;
  isReachable(): Promise<boolean>;
  /** Nomes dos modelos instalados (GET /api/tags) — p/ preflight antes de gerar. */
  listModels(): Promise<string[]>;
  /** Nomes dos modelos atualmente carregados em RAM/VRAM (GET /api/ps). */
  listLoadedModels(): Promise<string[]>;
  /**
   * Capacidades do modelo (POST /api/show) — 'thinking', 'tools', 'vision'…
   * Array vazio = não foi possível consultar (versão antiga/offline).
   */
  capabilities(model: string): Promise<string[]>;
}

export interface OllamaClientDeps {
  baseUrl?: string;
  keepAlive?: string;
  /** Injetável para testes — default: fetch nativo. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_KEEP_ALIVE = '10m';
const DEFAULT_TIMEOUT_MS = 600_000;

/**
 * keep_alive: Ollama aceita duration string ('10m', '0' segundos) ou inteiro
 * em segundos. Inteiro puro → number ('-1' = nunca descarrega — como string
 * falha com 'missing unit').
 */
const normalizeKeepAlive = (v: string): string | number =>
  /^-?\d+$/.test(v.trim()) ? Number(v.trim()) : v;

export function createOllamaClient(deps: OllamaClientDeps = {}): OllamaClient {
  const baseUrl = (deps.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const keepAlive = deps.keepAlive ?? DEFAULT_KEEP_ALIVE;
  const fetchImpl = deps.fetchImpl ?? fetch;

  async function chat(
    model: string,
    messages: OllamaMessage[],
    opts: OllamaChatOptions = {},
  ): Promise<string> {
    const stream = opts.stream ?? opts.onToken !== undefined;
    const signals = [AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)];
    if (opts.signal) signals.push(opts.signal);
    const res = await fetchImpl(`${baseUrl}/api/chat`, withDispatcher({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.any(signals),
      body: JSON.stringify({
        model,
        messages,
        stream,
        keep_alive: normalizeKeepAlive(opts.keepAlive ?? keepAlive),
        ...(opts.think ? { think: true } : {}),
        ...(opts.format !== undefined ? { format: opts.format } : {}),
        ...(opts.options ? { options: opts.options } : {}),
      }),
    }));

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Ollama /api/chat falhou (HTTP ${res.status}): ${body.slice(0, 300)}`);
    }

    if (!stream) {
      const data = (await res.json()) as {
        message?: { content?: string; thinking?: string };
      } & Record<string, unknown>;
      opts.onDone?.(statsFromChunk(data));
      if (data.message?.thinking) opts.onThought?.(data.message.thinking);
      return data.message?.content ?? '';
    }

    if (!res.body) throw new Error('Ollama: resposta sem body para streaming');
    return readNdjsonStream(res.body, opts.onToken, opts.onDone, opts.onThought);
  }

  async function embed(model: string, texts: string[]): Promise<number[][]> {
    const res = await fetchImpl(`${baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: texts }),
    });
    if (!res.ok) {
      throw new Error(`Ollama /api/embed falhou (HTTP ${res.status})`);
    }
    const data = (await res.json()) as { embeddings?: number[][] };
    return data.embeddings ?? [];
  }

  async function isReachable(): Promise<boolean> {
    try {
      const res = await fetchImpl(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function modelNames(endpoint: string): Promise<string[]> {
    try {
      const res = await fetchImpl(`${baseUrl}${endpoint}`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { models?: { name?: string }[] };
      return (data.models ?? []).map((m) => m.name ?? '').filter(Boolean);
    } catch {
      return [];
    }
  }

  const capsCache = new Map<string, string[]>();
  async function capabilities(model: string): Promise<string[]> {
    const cached = capsCache.get(model);
    if (cached) return cached;
    let caps: string[] = [];
    try {
      const res = await fetchImpl(`${baseUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { capabilities?: string[] };
        caps = data.capabilities ?? [];
      }
    } catch {
      // desconhecido — o consumidor decide entre otimista ou conservador
    }
    capsCache.set(model, caps);
    return caps;
  }

  return {
    chat,
    embed,
    isReachable,
    listModels: () => modelNames('/api/tags'),
    listLoadedModels: () => modelNames('/api/ps'),
    capabilities,
  };
}

/** Normaliza os campos de métricas do Ollama (nanosegundos → ms). */
function statsFromChunk(chunk: Record<string, unknown>): OllamaCallStats {
  const ns = (k: string) =>
    typeof chunk[k] === 'number' ? Math.round((chunk[k] as number) / 1e6) : undefined;
  const count = (k: string) => (typeof chunk[k] === 'number' ? (chunk[k] as number) : undefined);
  return {
    totalDurationMs: ns('total_duration'),
    loadDurationMs: ns('load_duration'),
    promptTokens: count('prompt_eval_count'),
    promptEvalDurationMs: ns('prompt_eval_duration'),
    outputTokens: count('eval_count'),
    evalDurationMs: ns('eval_duration'),
  };
}

/** Acumula o stream NDJSON do Ollama — cada linha é um chunk { message: { content } }. */
async function readNdjsonStream(
  body: ReadableStream<Uint8Array>,
  onToken?: (token: string) => void,
  onDone?: (stats: OllamaCallStats) => void,
  onThought?: (token: string) => void,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let stats: OllamaCallStats = {};

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try {
        const chunk = JSON.parse(line) as {
          message?: { content?: string; thinking?: string };
          done?: boolean;
        };
        if (chunk.done === true) stats = statsFromChunk(chunk);
        const thought = chunk.message?.thinking ?? '';
        if (thought) onThought?.(thought);
        const piece = chunk.message?.content ?? '';
        if (piece) {
          content += piece;
          onToken?.(piece);
        }
      } catch {
        // linha parcial/corrompida — ignora
      }
    }
  }
  onDone?.(stats);
  return content;
}
