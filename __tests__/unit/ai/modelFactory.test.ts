import {
  createModelClients,
  createEmbedder,
  ProviderNotImplementedError,
  type ModelCallStats,
} from '../../../src/ai/modelFactory';
import { loadCareerOpsConfig } from '../../../src/config/loadConfig';

function ollamaConfig(extra: Record<string, string> = {}) {
  return loadCareerOpsConfig({
    env: {
      AI_LOCAL_PROVIDER: 'ollama',
      AI_LOCAL_MODEL: 'hermes3:latest',
      AI_SMART_PROVIDER: 'ollama',
      AI_SMART_MODEL: 'hermes3:latest',
      ...extra,
    },
    envFile: '',
  });
}

function jsonResponse(content: string): Response {
  return new Response(JSON.stringify({ message: { content } }), { status: 200 });
}

const triageJson = JSON.stringify({
  fitScore: 85,
  isDealbreaker: false,
  missingSkills: ['rust'],
  matchedKeywords: ['typescript'],
  atsTitleSuggestion: 'Fullstack',
});

describe('createModelClients — provider ollama', () => {
  it('triageModel: POST format:json → validated JobTriageResult', async () => {
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockResolvedValue(
      jsonResponse(triageJson),
    );
    const clients = createModelClients(ollamaConfig(), { ollama: { fetchImpl } });

    const out = await clients.triageModel.generate('triar esta vaga');
    expect(out.fitScore).toBe(85);
    expect(out.atsTitleSuggestion).toBe('Fullstack');

    const body = JSON.parse(
      (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.model).toBe('hermes3:latest');
    // structured output: o JSON Schema do JobTriageSchema vai em format
    expect(body.format.properties.fitScore).toMatchObject({ type: 'number' });
  });

  it('structurerModel: returns profile validated by MasterProfileSchema', async () => {
    const profileJson = JSON.stringify({
      fullName: 'Ana',
      email: 'a@b.c',
      phone: 'n',
      linkedin: 'n',
      github: 'n',
      portfolio: 'n',
      location: 'n',
      summary: 'n',
      coreStack: ['ts'],
      seniorityYears: 5,
      experiences: [],
      projects: [],
      openSourceProjects: [],
      education: [],
      languages: ['pt'],
      certifications: [],
      blockedKeywords: [],
      standardAnswers: {},
      salaryExpectationBRL: null,
      salaryExpectationUSD: null,
    });
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockResolvedValue(
      jsonResponse(profileJson),
    );
    const clients = createModelClients(ollamaConfig(), { ollama: { fetchImpl } });

    const out = await clients.structurerModel.generate('estruture');
    expect(out.fullName).toBe('Ana');
    expect(out.salaryExpectationBRL).toBeNull();
  });

  it('tailorModel: resumeMarkdown + answers via guided JSON', async () => {
    const tailorJson = JSON.stringify({ resumeMarkdown: '# CV', answers: {} });
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockResolvedValue(
      jsonResponse(tailorJson),
    );
    const clients = createModelClients(ollamaConfig(), { ollama: { fetchImpl } });

    const out = await clients.tailorModel.tailor('adapte o cv');
    expect(out.resumeMarkdown).toBe('# CV');
    const prompt = JSON.parse(
      (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    ).messages[0].content;
    expect(prompt).toContain('resumeMarkdown');
  });

  it('onToken is propagated → NDJSON streaming mode', async () => {
    const ndjson = JSON.stringify({ message: { content: triageJson } }) + '\n';
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockResolvedValue(
      new Response(ndjson),
    );
    const tokens: string[] = [];
    const clients = createModelClients(ollamaConfig(), {
      onToken: (t) => tokens.push(t),
      ollama: { fetchImpl },
    });
    const out = await clients.triageModel.generate('v');
    expect(out.fitScore).toBe(85);
    expect(tokens.join('')).toBe(triageJson);
    const body = JSON.parse(
      (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.stream).toBe(true);
  });

  it('onStage receives normalized metrics (tok/s computed)', async () => {
    const ndjson =
      JSON.stringify({ message: { content: triageJson } }) +
      '\n' +
      JSON.stringify({
        done: true,
        total_duration: 3e9,
        eval_count: 100,
        eval_duration: 4e9,
      }) +
      '\n';
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockResolvedValue(
      new Response(ndjson),
    );
    const stages: ModelCallStats[] = [];
    const clients = createModelClients(ollamaConfig(), {
      onToken: () => {},
      onStage: (s) => stages.push(s),
      ollama: { fetchImpl },
    });
    await clients.triageModel.generate('x');
    expect(stages).toHaveLength(1);
    expect(stages[0]).toMatchObject({
      stage: 'triage',
      provider: 'ollama',
      modelId: 'hermes3:latest',
      outputTokens: 100,
      tokensPerSecond: 25,
      durationMs: 3000,
    });
  });

  it('AI_THINK_ENABLED + model sem capability "thinking" → think não vai no body', async () => {
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockImplementation(
      (input) => {
        const url = String(input);
        if (url.includes('/api/show'))
          return Promise.resolve(new Response(JSON.stringify({ capabilities: ['completion'] })));
        return Promise.resolve(jsonResponse(triageJson));
      },
    );
    const clients = createModelClients(
      ollamaConfig(),
      { ollama: { fetchImpl } },
      { AI_THINK_ENABLED: 'true' },
    );
    await clients.triageModel.generate('x');
    const chatCall = fetchImpl.mock.calls.find((c) => String(c[0]).includes('/api/chat'))!;
    const body = JSON.parse(chatCall[1]!.body as string);
    expect(body.think).toBeUndefined();
  });

  it('400 "does not support thinking" → retry automático sem think', async () => {
    let chatCalls = 0;
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockImplementation(
      (input) => {
        const url = String(input);
        if (url.includes('/api/show'))
          return Promise.resolve(new Response('{"error":"boom"}', { status: 500 }));
        if (url.includes('/api/chat')) {
          chatCalls++;
          if (chatCalls === 1)
            return Promise.resolve(
              new Response('{"error":"\\"m\\" does not support thinking"}', { status: 400 }),
            );
          return Promise.resolve(jsonResponse(triageJson));
        }
        return Promise.resolve(new Response('{}'));
      },
    );
    const clients = createModelClients(
      ollamaConfig(),
      { ollama: { fetchImpl } },
      { AI_THINK_ENABLED: 'true' },
    );
    const out = await clients.triageModel.generate('x');
    expect(out.fitScore).toBe(85);
    expect(chatCalls).toBe(2);
    const chatBodies = fetchImpl.mock.calls
      .filter((c) => String(c[0]).includes('/api/chat'))
      .map((c) => JSON.parse(c[1]!.body as string));
    expect(chatBodies[0].think).toBe(true);
    expect(chatBodies[1].think).toBeUndefined();
  });
});

describe('createModelClients — overrides de routing (fallback do preflight)', () => {
  it('override.smart troca provider/modelo do adapter', async () => {
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockResolvedValue(
      jsonResponse(JSON.stringify({ resumeMarkdown: '# x', answers: {} })),
    );
    const clients = createModelClients(ollamaConfig(), {
      ollama: { fetchImpl },
      overrides: {
        smart: { provider: 'ollama', modelId: 'llama3.2:3b', baseUrl: 'http://gpu:11434' },
      },
    });
    await clients.tailorModel.tailor('x');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://gpu:11434/api/chat');
    expect(JSON.parse(init.body as string).model).toBe('llama3.2:3b');
  });
});

describe('createModelClients — OpenAI-compatible providers', () => {
  it('AI_SMART_PROVIDER=deepseek routes tailor through /chat/completions', async () => {
    const config = loadCareerOpsConfig({
      env: { AI_SMART_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'sk-x' },
      envFile: '',
    });
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: JSON.stringify({ resumeMarkdown: '# CV', answers: {} }) } },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        { status: 200 },
      ),
    );
    const clients = createModelClients(
      config,
      { openai: { fetchImpl } },
      { DEEPSEEK_API_KEY: 'sk-x' },
    );

    const out = await clients.tailorModel.tailor('prompt');
    expect(out.resumeMarkdown).toBe('# CV');

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-x');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('deepseek-chat');
    expect(body.response_format.type).toBe('json_schema');
  });

  it('provider without default endpoint and no BASE_URL → ProviderNotImplementedError', async () => {
    const config = loadCareerOpsConfig({
      env: { AI_LOCAL_PROVIDER: 'provider-inexistente' },
      envFile: '',
    });
    expect(() => createModelClients(config)).toThrow(ProviderNotImplementedError);
  });
});

describe('createEmbedder', () => {
  it('embeddings disabled → undefined', () => {
    expect(createEmbedder(ollamaConfig())).toBeUndefined();
  });

  it('enabled → returns a functional embedder', () => {
    const cfg = ollamaConfig({
      AI_EMBEDDINGS_ENABLED: 'true',
      OLLAMA_EMBED_MODEL: 'nomic-embed-text',
    });
    expect(cfg.ai.embeddings?.enabled).toBe(true);
    expect(cfg.ai.embeddings?.modelId).toBe('nomic-embed-text');
    const emb = createEmbedder(cfg);
    expect(emb).toBeDefined();
    expect(typeof emb?.embed).toBe('function');
  });
});
