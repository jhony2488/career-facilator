import {
  createModelClients,
  createEmbedder,
  ProviderNotImplementedError,
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
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockResolvedValue(jsonResponse(triageJson));
    const clients = createModelClients(ollamaConfig(), { ollama: { fetchImpl } });

    const out = await clients.triageModel.generate('triar esta vaga');
    expect(out.fitScore).toBe(85);
    expect(out.atsTitleSuggestion).toBe('Fullstack');

    const body = JSON.parse(
      ((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body) as string,
    );
    expect(body.model).toBe('hermes3:latest');
    expect(body.format).toBe('json');
  });

  it('structurerModel: returns profile validated by MasterProfileSchema', async () => {
    const profileJson = JSON.stringify({
      fullName: 'Ana', email: 'a@b.c', phone: 'n', linkedin: 'n', github: 'n',
      portfolio: 'n', summary: 'n', coreStack: ['ts'], seniorityYears: 5,
      experiences: [], projects: [], openSourceProjects: [], education: [],
      languages: ['pt'], certifications: [], blockedKeywords: [],
      standardAnswers: {}, salaryExpectationBRL: null, salaryExpectationUSD: null,
    });
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockResolvedValue(jsonResponse(profileJson));
    const clients = createModelClients(ollamaConfig(), { ollama: { fetchImpl } });

    const out = await clients.structurerModel.generate('estruture');
    expect(out.fullName).toBe('Ana');
    expect(out.salaryExpectationBRL).toBeNull();
  });

  it('tailorModel: resumeMarkdown + answers via guided JSON', async () => {
    const tailorJson = JSON.stringify({ resumeMarkdown: '# CV', answers: {} });
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockResolvedValue(jsonResponse(tailorJson));
    const clients = createModelClients(ollamaConfig(), { ollama: { fetchImpl } });

    const out = await clients.tailorModel.tailor('adapte o cv');
    expect(out.resumeMarkdown).toBe('# CV');
    const prompt = JSON.parse(
      ((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body) as string,
    ).messages[0].content;
    expect(prompt).toContain('resumeMarkdown');
  });

  it('onToken is propagated → NDJSON streaming mode', async () => {
    const ndjson = JSON.stringify({ message: { content: triageJson } }) + '\n';
    const fetchImpl = (jest.fn() as jest.MockedFunction<typeof fetch>).mockResolvedValue(new Response(ndjson));
    const tokens: string[] = [];
    const clients = createModelClients(ollamaConfig(), {
      onToken: (t) => tokens.push(t),
      ollama: { fetchImpl },
    });
    const out = await clients.triageModel.generate('v');
    expect(out.fitScore).toBe(85);
    expect(tokens.join('')).toBe(triageJson);
    const body = JSON.parse(
      ((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body) as string,
    );
    expect(body.stream).toBe(true);
  });
});

describe('createModelClients — non-ollama provider', () => {
  it('adapter rejects with clear ProviderNotImplementedError', async () => {
    const config = loadCareerOpsConfig({
      env: { AI_LOCAL_PROVIDER: 'groq', AI_SMART_PROVIDER: 'kimi' },
      envFile: '',
    });
    const clients = createModelClients(config);
    await expect(clients.triageModel.generate('x')).rejects.toThrow(ProviderNotImplementedError);
    await expect(clients.structurerModel.generate('x')).rejects.toThrow('kimi');
  });
});

describe('createEmbedder', () => {
  it('embeddings disabled → undefined', () => {
    expect(createEmbedder(ollamaConfig())).toBeUndefined();
  });

  it('enabled → returns a functional embedder', () => {
    const cfg = ollamaConfig({ AI_EMBEDDINGS_ENABLED: 'true', OLLAMA_EMBED_MODEL: 'nomic-embed-text' });
    expect(cfg.ai.embeddings?.enabled).toBe(true);
    expect(cfg.ai.embeddings?.modelId).toBe('nomic-embed-text');
    const emb = createEmbedder(cfg);
    expect(emb).toBeDefined();
    expect(typeof emb?.embed).toBe('function');
  });
});
