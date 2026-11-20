/**
 * Client Ollama real — HTTP via fetch nativo (Node 22+, zero deps).
 * Suporta geração de chat com/sem streaming (NDJSON), format:json para saída
 * estruturada de modelos pequenos, embeddings e keep-alive.
 */

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatOptions {
  /** 'json' força saída JSON válida; objeto = JSON schema (Ollama ≥ 0.5). */
  format?: 'json' | Record<string, unknown>;
  /** num_predict, temperature, etc. — repassados direto ao Ollama. */
  options?: Record<string, unknown>;
  /** Tempo que o modelo fica em memória (ex.: '10m'). Default config/env. */
  keepAlive?: string;
  stream?: boolean;
  /** Callback por token — expõe streaming ao consumidor (CLI/UI). */
  onToken?: (token: string) => void;
  timeoutMs?: number;
}

export interface OllamaClient {
  chat(model: string, messages: OllamaMessage[], opts?: OllamaChatOptions): Promise<string>;
  embed(model: string, texts: string[]): Promise<number[][]>;
  isReachable(): Promise<boolean>;
}

export interface OllamaClientDeps {
  baseUrl?: string;
  keepAlive?: string;
  /** Injetável para testes — default: fetch nativo. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_KEEP_ALIVE = '10m';
const DEFAULT_TIMEOUT_MS = 300_000;

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
    const res = await fetchImpl(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        messages,
        stream,
        keep_alive: opts.keepAlive ?? keepAlive,
        ...(opts.format !== undefined ? { format: opts.format } : {}),
        ...(opts.options ? { options: opts.options } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Ollama /api/chat falhou (HTTP ${res.status}): ${body.slice(0, 300)}`);
    }

    if (!stream) {
      const data = (await res.json()) as { message?: { content?: string } };
      return data.message?.content ?? '';
    }

    if (!res.body) throw new Error('Ollama: resposta sem body para streaming');
    return readNdjsonStream(res.body, opts.onToken);
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

  return { chat, embed, isReachable };
}

/** Acumula o stream NDJSON do Ollama — cada linha é um chunk { message: { content } }. */
async function readNdjsonStream(
  body: ReadableStream<Uint8Array>,
  onToken?: (token: string) => void,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';

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
        const chunk = JSON.parse(line) as { message?: { content?: string } };
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
  return content;
}
