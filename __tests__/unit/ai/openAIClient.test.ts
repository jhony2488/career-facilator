import { createOpenAIClient } from '../../../src/ai/openaiCompatibleClient';

function makeFetch(
  impl: (url: string, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return jest.fn(impl) as unknown as typeof fetch;
}

function bodyOf(fetchImpl: typeof fetch, call = 0): Record<string, unknown> {
  const init = (fetchImpl as jest.Mock).mock.calls[call][1] as RequestInit;
  return JSON.parse(init.body as string);
}

function sse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const s of chunks) c.enqueue(new TextEncoder().encode(s));
      c.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe('openaiCompatibleClient — OpenAI-compat providers (deepseek, groq, …)', () => {
  it('posts to /chat/completions with Bearer auth and returns content + usage', async () => {
    const onDone = jest.fn();
    const fetchImpl = makeFetch(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'resposta' } }],
            usage: { prompt_tokens: 42, completion_tokens: 7 },
          }),
          { status: 200 },
        ),
      ),
    );
    const client = createOpenAIClient({
      provider: 'deepseek',
      apiKey: 'sk-test',
      fetchImpl,
    });

    const out = await client.chat('deepseek-chat', [{ role: 'user', content: 'oi' }], {
      options: { num_predict: 512, temperature: 0.2 },
      onDone,
    });

    expect(out).toBe('resposta');
    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init.body as string);
    expect(body.max_tokens).toBe(512);
    expect(body.temperature).toBe(0.2);
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ promptTokens: 42, outputTokens: 7 }),
    );
  });

  it('maps a Record format to response_format json_schema', async () => {
    const fetchImpl = makeFetch(async () =>
      Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), {
          status: 200,
        }),
      ),
    );
    const client = createOpenAIClient({ provider: 'deepseek', apiKey: 'k', fetchImpl });
    await client.chat('m', [{ role: 'user', content: 'x' }], {
      format: { type: 'object', properties: { a: { type: 'string' } } },
    });
    const rf = bodyOf(fetchImpl).response_format as Record<string, unknown>;
    expect(rf.type).toBe('json_schema');
  });

  it('falls back to json_object when the provider rejects json_schema (400)', async () => {
    let calls = 0;
    const fetchImpl = makeFetch(async () => {
      calls++;
      if (calls === 1) return new Response('bad request', { status: 400 });
      return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), {
        status: 200,
      });
    });
    const client = createOpenAIClient({ provider: 'deepseek', apiKey: 'k', fetchImpl });
    const out = await client.chat('m', [{ role: 'user', content: 'x' }], {
      format: { type: 'object' },
    });
    expect(out).toBe('{}');
    const rf = bodyOf(fetchImpl, 1).response_format as Record<string, unknown>;
    expect(rf.type).toBe('json_object');
  });

  it('streams SSE chunks: content→onToken, reasoning_content→onThought, usage→onDone', async () => {
    const onToken = jest.fn();
    const onThought = jest.fn();
    const onDone = jest.fn();
    const fetchImpl = makeFetch(async () =>
      Promise.resolve(
        sse([
          'data: {"choices":[{"delta":{"reasoning_content":"pensando"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
          'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n',
          'data: [DONE]\n\n',
        ]),
      ),
    );
    const client = createOpenAIClient({ provider: 'deepseek', apiKey: 'k', fetchImpl });
    const out = await client.chat('deepseek-reasoner', [{ role: 'user', content: 'x' }], {
      onToken,
      onThought,
      onDone,
    });

    expect(out).toBe('Hello');
    expect(onThought).toHaveBeenCalledWith('pensando');
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ promptTokens: 5, outputTokens: 2 }),
    );
  });

  it('throws a helpful error when the provider has no default endpoint', () => {
    expect(() => createOpenAIClient({ provider: 'exemplo-desconhecido' })).toThrow(/_BASE_URL/);
  });

  it('throws on non-2xx after degradation attempts', async () => {
    const fetchImpl = makeFetch(async () => Promise.resolve(new Response('down', { status: 503 })));
    const client = createOpenAIClient({ provider: 'deepseek', apiKey: 'k', fetchImpl });
    await expect(client.chat('m', [{ role: 'user', content: 'x' }])).rejects.toThrow('503');
  });
});
