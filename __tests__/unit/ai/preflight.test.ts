import { checkProvider, checkProviders } from '../../../src/ai/preflight';
import { loadCareerOpsConfig } from '../../../src/config/loadConfig';
import type { ModelRouting } from '../../../src/config/careerOps.config';

const ollamaRouting: ModelRouting = {
  provider: 'ollama',
  modelId: 'hermes3:latest',
  baseUrl: 'http://localhost:11434',
};

const groqRouting: ModelRouting = {
  provider: 'groq',
  modelId: 'llama-3.3-70b',
  apiKeyEnv: 'GROQ_API_KEY',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('checkProvider — ollama', () => {
  it('modelo presente em /api/tags → ok', async () => {
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockResolvedValue(
      json({ models: [{ name: 'hermes3:latest' }] }),
    );
    const r = await checkProvider('smart', ollamaRouting, { fetchImpl });
    expect(r.status).toBe('ok');
    expect(r.adapterImplemented).toBe(true);
    expect(r.latencyMs).toBeDefined();
  });

  it('modelo ausente → model_missing com dica de pull', async () => {
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockResolvedValue(
      json({ models: [{ name: 'qwen2.5:7b' }] }),
    );
    const r = await checkProvider('local', ollamaRouting, { fetchImpl });
    expect(r.status).toBe('model_missing');
    expect(r.detail).toContain('ollama pull hermes3:latest');
  });

  it('modelId sem tag → compara com :latest implícito', async () => {
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockResolvedValue(
      json({ models: [{ name: 'hermes3:latest' }] }),
    );
    const r = await checkProvider('local', { ...ollamaRouting, modelId: 'hermes3' }, { fetchImpl });
    expect(r.status).toBe('ok');
  });

  it('fetch rejeita → offline', async () => {
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockRejectedValue(
      new Error('ECONNREFUSED'),
    );
    const r = await checkProvider('local', ollamaRouting, { fetchImpl });
    expect(r.status).toBe('offline');
  });
});

describe('checkProvider — providers remotos', () => {
  it('chave ausente → missing_key sem chamar HTTP', async () => {
    const fetchImpl = jest.fn() as jest.MockedFunction<typeof fetch>;
    const r = await checkProvider('smart', groqRouting, { fetchImpl, env: {} });
    expect(r.status).toBe('missing_key');
    expect(r.detail).toBe('GROQ_API_KEY ausente');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('200 → ok; Authorization Bearer enviado', async () => {
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockResolvedValue(json({}));
    const r = await checkProvider('smart', groqRouting, {
      fetchImpl,
      env: { GROQ_API_KEY: 'gsk_x' },
    });
    expect(r.status).toBe('ok');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/models');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer gsk_x');
  });

  it('401 → http_error com hint de chave', async () => {
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockResolvedValue(
      json({}, 401),
    );
    const r = await checkProvider('smart', groqRouting, {
      fetchImpl,
      env: { GROQ_API_KEY: 'bad' },
    });
    expect(r.status).toBe('http_error');
    expect(r.detail).toContain('HTTP 401');
  });

  it('provider OpenAI-compatível → adapterImplemented=true', async () => {
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockResolvedValue(json({}));
    const r = await checkProvider('smart', groqRouting, {
      fetchImpl,
      env: { GROQ_API_KEY: 'k' },
    });
    expect(r.adapterImplemented).toBe(true);
  });

  it('provider desconhecido sem baseUrl → adapterImplemented=false', async () => {
    const fetchImpl = jest.fn() as jest.MockedFunction<typeof fetch>;
    const r = await checkProvider(
      'smart',
      { provider: 'provedor-xpto', modelId: 'm' },
      { fetchImpl, env: {} },
    );
    expect(r.adapterImplemented).toBe(false);
  });

  it('gemini → chave na query string', async () => {
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockResolvedValue(json({}));
    const r = await checkProvider(
      'smart',
      { provider: 'gemini', modelId: 'gemini-2.0-flash', apiKeyEnv: 'GEMINI_API_KEY' },
      { fetchImpl, env: { GEMINI_API_KEY: 'gk' } },
    );
    expect(r.status).toBe('ok');
    const url = (fetchImpl.mock.calls[0] as unknown as [string])[0];
    expect(url).toContain('key=gk');
  });

  it('provider desconhecido com baseUrl → heurística /models', async () => {
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockResolvedValue(json({}));
    const r = await checkProvider(
      'local',
      { provider: 'vllm', modelId: 'm', baseUrl: 'http://gpu:8000' },
      { fetchImpl, env: {} },
    );
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('http://gpu:8000/models');
    expect(r.status).toBe('ok');
  });

  it('provider desconhecido sem baseUrl nem chave → skipped', async () => {
    const r = await checkProvider('local', { provider: 'foo', modelId: 'm' }, { env: {} });
    expect(r.status).toBe('skipped');
  });
});

describe('checkProviders — habilitação e paralelismo', () => {
  it('AI_PREFLIGHT_ENABLED=false → tudo skipped', async () => {
    const cfg = loadCareerOpsConfig({ env: { AI_PREFLIGHT_ENABLED: 'false' }, envFile: '' });
    const results = await checkProviders(cfg, ['local', 'fast', 'smart'], {
      env: { AI_PREFLIGHT_ENABLED: 'false' },
    });
    expect(results.every((r) => r.status === 'skipped')).toBe(true);
  });

  it('roda os tiers em paralelo e preserva ordem', async () => {
    const cfg = loadCareerOpsConfig({ env: {}, envFile: '' });
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockResolvedValue(
      json({ models: [{ name: 'qwen2.5:7b' }] }),
    );
    const results = await checkProviders(cfg, ['local'], { fetchImpl, env: {} });
    expect(results[0].tier).toBe('local');
  });
});
