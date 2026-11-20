import { z } from 'zod';
import { createOllamaClient, type OllamaClient } from '../ai/ollamaClient';
import { generateStructured } from '../ai/jsonRepair';
import { cleanJobHtml } from '../scraper/domCleaner';
import type { CareerOpsConfig } from '../config/careerOps.config';
import type { GenericExtractor } from './types';

const ExtractedJobSchema = z.object({
  title: z.string(),
  url: z.string(),
  company: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

const ExtractedJobsSchema = z.object({
  jobs: z.array(ExtractedJobSchema),
});

const GENERIC_JOBS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    jobs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          url: { type: 'string' },
          company: { type: ['string', 'null'] },
          location: { type: ['string', 'null'] },
          description: { type: ['string', 'null'] },
        },
        required: ['title', 'url'],
      },
    },
  },
  required: ['jobs'],
};

const MAX_PAGE_CHARS = 12_000;

export type GenericExtractorResult =
  { extract: GenericExtractor; modelId: string } | { error: string };

/**
 * Cria o extrator genérico de HTML → vagas.
 * Modelo: DISCOVERY_GENERIC_MODEL preenchido usa esse ID; vazio herda o tier
 * local já configurado (AI_LOCAL_PROVIDER/AI_LOCAL_MODEL). Hoje só provider
 * ollama — outros providers retornam `error` em vez de criar client inválido.
 */
export function createGenericExtractor(
  config: CareerOpsConfig,
  opts: {
    env?: Record<string, string | undefined>;
    signal?: AbortSignal;
    client?: OllamaClient;
  } = {},
): GenericExtractorResult | undefined {
  if (!config.discovery.useGenericHtmlFallback) return undefined;
  const routing = config.ai.local;
  const modelId = config.discovery.genericExtractionModel?.trim() || routing.modelId;
  if (routing.provider !== 'ollama') {
    return {
      error: `DISCOVERY_USE_GENERIC_FALLBACK exige AI_LOCAL_PROVIDER=ollama (atual: ${routing.provider})`,
    };
  }

  const env = opts.env ?? process.env;
  const client =
    opts.client ??
    createOllamaClient({ baseUrl: routing.baseUrl, keepAlive: env.OLLAMA_KEEP_ALIVE });

  const extract: GenericExtractor = async (html, pageUrl, maxJobs) => {
    const markdown = cleanJobHtml(html, pageUrl).markdown.slice(0, MAX_PAGE_CHARS);
    const prompt = buildPrompt(markdown, pageUrl, maxJobs);
    const result = await generateStructured(
      (p) =>
        client.chat(modelId, [{ role: 'user', content: p }], {
          format: GENERIC_JOBS_SCHEMA,
          signal: opts.signal,
          options: { num_predict: 2048, temperature: 0 },
        }),
      prompt,
      ExtractedJobsSchema,
    );
    return result.jobs
      .map((j) => ({
        title: j.title.trim(),
        url: j.url.trim(),
        company: j.company?.trim() || undefined,
        location: j.location?.trim() || undefined,
        description: j.description?.trim() || undefined,
      }))
      .filter((j) => j.title.length > 0 && j.url.length > 0)
      .map((j) => ({ ...j, url: resolveUrl(j.url, pageUrl) }))
      .filter((j) => j.url.startsWith('http'))
      .slice(0, maxJobs);
  };

  return { extract, modelId };
}

function buildPrompt(markdown: string, pageUrl: string, maxJobs: number): string {
  return [
    'You extract job postings from a job board listing page.',
    `Page URL: ${pageUrl}`,
    '',
    'Return ONLY a JSON object: {"jobs": [{"title": "...", "url": "...", "company": "...", "location": "...", "description": "..."}]}',
    'Rules:',
    '- Only real job postings actually present in the page. Never invent titles, companies, links or descriptions.',
    '- url must be the absolute URL of the individual job posting (resolve relative links against the page URL).',
    '- Omit company/location/description when not visible.',
    '- If the page has no job listings, return {"jobs": []}.',
    `- At most ${maxJobs} jobs.`,
    '',
    'Page content (markdown):',
    '"""',
    markdown,
    '"""',
  ].join('\n');
}

function resolveUrl(url: string, pageUrl: string): string {
  try {
    return new URL(url, pageUrl).toString();
  } catch {
    return url;
  }
}
