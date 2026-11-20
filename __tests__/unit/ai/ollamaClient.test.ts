import { createOllamaClient } from '../../../src/ai/ollamaClient';

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
