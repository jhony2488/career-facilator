import { createGenericExtractor } from '../../../src/discovery/genericExtractor';
import { makeConfig } from '../../helpers/factories';
import type { OllamaClient } from '../../../src/ai/ollamaClient';

const fakeClient = (response: string) => {
  const chat = jest.fn(async () => response);
  return { client: { chat } as unknown as OllamaClient, chat };
};

describe('createGenericExtractor', () => {
  it('returns undefined when the generic fallback is disabled', () => {
    const config = makeConfig();
    config.discovery.useGenericHtmlFallback = false;
    expect(createGenericExtractor(config)).toBeUndefined();
  });

  it('inherits the configured LOCAL tier model when DISCOVERY_GENERIC_MODEL is empty', () => {
    const config = makeConfig();
    config.ai.local = { provider: 'ollama', modelId: 'llama3.2:3b' };
    const res = createGenericExtractor(config);
    expect(res && 'modelId' in res ? res.modelId : undefined).toBe('llama3.2:3b');
  });

  it('uses DISCOVERY_GENERIC_MODEL when explicitly set', () => {
    const config = makeConfig();
    config.ai.local = { provider: 'ollama', modelId: 'llama3.2:3b' };
    config.discovery.genericExtractionModel = 'qwen2.5:7b';
    const res = createGenericExtractor(config);
    expect(res && 'modelId' in res ? res.modelId : undefined).toBe('qwen2.5:7b');
  });

  it('reports an error when the LOCAL tier is not ollama', () => {
    const config = makeConfig();
    config.ai.local = { provider: 'groq', modelId: 'llama-3.1-8b-instant' };
    const res = createGenericExtractor(config);
    expect(res && 'error' in res ? res.error : '').toContain('ollama');
  });

  it('extracts jobs from page HTML and resolves relative URLs', async () => {
    const config = makeConfig();
    const { client, chat } = fakeClient(
      JSON.stringify({
        jobs: [
          {
            title: 'Backend Developer',
            url: '/jobs/123',
            company: 'Acme',
            location: 'Remote',
          },
          { title: 'Ghost Job', url: '' },
        ],
      }),
    );
    const res = createGenericExtractor(config, { client });
    if (!res || !('extract' in res)) throw new Error('extractor not created');
    const jobs = await res.extract(
      '<html><body><a href="/jobs/123">Backend Developer</a></body></html>',
      'https://board.example/listings',
      10,
    );
    expect(chat).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ format: expect.anything() }),
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].url).toBe('https://board.example/jobs/123');
    expect(jobs[0].company).toBe('Acme');
  });

  it('caps extracted jobs at maxJobs', async () => {
    const config = makeConfig();
    const { client } = fakeClient(
      JSON.stringify({
        jobs: [
          { title: 'A', url: 'https://x/1' },
          { title: 'B', url: 'https://x/2' },
          { title: 'C', url: 'https://x/3' },
        ],
      }),
    );
    const res = createGenericExtractor(config, { client });
    if (!res || !('extract' in res)) throw new Error('extractor not created');
    const jobs = await res.extract('<html></html>', 'https://board.example/', 2);
    expect(jobs).toHaveLength(2);
  });
});
