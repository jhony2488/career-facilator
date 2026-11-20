import { createOllamaClient } from '../../../src/ai/ollamaClient';
import type { OllamaCallStats } from '../../../src/ai/ollamaClient';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function ndjsonResponse(lines: object[]): Response {
  const text = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe('createOllamaClient', () => {
  it('chat without streaming → returns message.content', async () => {
    const fetchImpl = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockResolvedValue(jsonResponse({ message: { content: '{"ok":true}' } }));
    const client = createOllamaClient({ fetchImpl });

    const out = await client.chat('hermes3:latest', [{ role: 'user', content: 'oi' }]);
    expect(out).toBe('{"ok":true}');

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('hermes3:latest');
    expect(body.stream).toBe(false);
    expect(body.keep_alive).toBe('10m');
  });

  it('chat with onToken → accumulated NDJSON stream + per-chunk callback', async () => {
    const chunks = ['{"resu', 'meMarkdown":', ' "x"}'];
    const fetchImpl = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockResolvedValue(ndjsonResponse(chunks.map((c) => ({ message: { content: c } }))));
    const client = createOllamaClient({ fetchImpl });

    const tokens: string[] = [];
    const out = await client.chat('hermes3:latest', [{ role: 'user', content: 'oi' }], {
      onToken: (t) => tokens.push(t),
      format: 'json',
    });

    expect(out).toBe('{"resumeMarkdown": "x"}');
    expect(tokens).toEqual(chunks);
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.stream).toBe(true);
    expect(body.format).toBe('json');
  });

  it('onDone receives metrics from the final stream chunk (ns → ms)', async () => {
    const fetchImpl = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockResolvedValue(
      ndjsonResponse([
        { message: { content: 'a' } },
        {
          done: true,
          total_duration: 4.2e9,
          load_duration: 1.1e9,
          prompt_eval_count: 100,
          eval_count: 40,
          eval_duration: 2e9,
        },
      ]),
    );
    const client = createOllamaClient({ fetchImpl });
    let stats: OllamaCallStats = {};
    await client.chat('m', [], { onDone: (s) => (stats = s), stream: true });
    expect(stats.totalDurationMs).toBe(4200);
    expect(stats.loadDurationMs).toBe(1100);
    expect(stats.promptTokens).toBe(100);
    expect(stats.outputTokens).toBe(40);
    expect(stats.evalDurationMs).toBe(2000);
  });

  it('onDone also works on non-stream responses (top-level metrics)', async () => {
    const fetchImpl = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockResolvedValue(
      jsonResponse({ message: { content: 'x' }, total_duration: 1e9, eval_count: 10 }),
    );
    const client = createOllamaClient({ fetchImpl });
    let stats: OllamaCallStats = {};
    const out = await client.chat('m', [], { onDone: (s) => (stats = s) });
    expect(out).toBe('x');
    expect(stats.totalDurationMs).toBe(1000);
    expect(stats.outputTokens).toBe(10);
  });

  it('think:true enviado; chunk message.thinking → onThought', async () => {
    const fetchImpl = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockResolvedValue(
      ndjsonResponse([
        { message: { thinking: 'analisando a vaga...' } },
        { message: { content: '{"fitScore":80}' }, done: true },
      ]),
    );
    const client = createOllamaClient({ fetchImpl });
    const thoughts: string[] = [];
    const out = await client.chat('deepseek-r1:1.5b', [], {
      think: true,
      onToken: () => {},
      onThought: (t) => thoughts.push(t),
    });
    expect(out).toBe('{"fitScore":80}');
    expect(thoughts.join('')).toBe('analisando a vaga...');
    const body = JSON.parse(
      (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.think).toBe(true);
  });

  it("keepAlive '-1' → enviado como número (Ollama recusa string sem unidade)", async () => {
    const fetchImpl = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockResolvedValue(jsonResponse({ message: { content: 'x' } }));
    const client = createOllamaClient({ fetchImpl, keepAlive: '-1' });
    await client.chat('m', []);
    const body = JSON.parse(
      (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.keep_alive).toBe(-1);
  });

  it('caller signal is combined with timeout and forwarded to fetch', async () => {
    const fetchImpl = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockResolvedValue(jsonResponse({ message: { content: 'x' } }));
    const client = createOllamaClient({ fetchImpl });
    const ctrl = new AbortController();
    await client.chat('m', [], { signal: ctrl.signal });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBeDefined();
    expect(init.signal!.aborted).toBe(false);
    ctrl.abort();
    expect(init.signal!.aborted).toBe(true);
  });

  it('aborted caller signal rejects the in-flight request', async () => {
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockImplementation(
      (_u, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })),
          );
        }),
    );
    const client = createOllamaClient({ fetchImpl });
    const ctrl = new AbortController();
    const pending = client.chat('m', [], { signal: ctrl.signal });
    ctrl.abort();
    await expect(pending).rejects.toThrow('Aborted');
  });

  it('listModels → model names from /api/tags', async () => {
    const fetchImpl = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockResolvedValue(
      jsonResponse({ models: [{ name: 'hermes3:latest' }, { name: 'qwen2.5:7b' }] }),
    );
    const client = createOllamaClient({ fetchImpl });
    expect(await client.listModels()).toEqual(['hermes3:latest', 'qwen2.5:7b']);
  });

  it('embed → POST /api/embed returns embeddings', async () => {
    const fetchImpl = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockResolvedValue(jsonResponse({ embeddings: [[0.1, 0.2], [0.3, 0.4]] }));
    const client = createOllamaClient({ fetchImpl });

    const out = await client.embed('nomic-embed-text', ['a', 'b']);
    expect(out).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(
      'http://localhost:11434/api/embed',
    );
  });

  it('custom baseUrl is used in the endpoints', async () => {
    const fetchImpl = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockResolvedValue(jsonResponse({ message: { content: 'x' } }));
    const client = createOllamaClient({ fetchImpl, baseUrl: 'http://gpu:11434' });
    await client.chat('m', []);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('http://gpu:11434/api/chat');
  });

  it('non-ok HTTP → error with status and body', async () => {
    const fetchImpl = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockResolvedValue(new Response('model not found', { status: 404 }));
    const client = createOllamaClient({ fetchImpl });
    await expect(client.chat('inexistente', [])).rejects.toThrow('HTTP 404');
  });

  it('isReachable → true when /api/tags responds, false when it throws', async () => {
    const ok = createOllamaClient({
      fetchImpl: (jest.fn() as jest.MockedFunction<typeof fetch>).mockResolvedValue(jsonResponse({ models: [] })),
    });
    expect(await ok.isReachable()).toBe(true);

    const down = createOllamaClient({
      fetchImpl: (jest.fn() as jest.MockedFunction<typeof fetch>).mockRejectedValue(new Error('ECONNREFUSED')),
    });
    expect(await down.isReachable()).toBe(false);
  });
});
