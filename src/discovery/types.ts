import type {
  CareerOpsConfig,
  DiscoveryAdapter,
  SearchEngine,
  WorkModel,
} from '../config/careerOps.config';
import type { RawJobInput } from '../core/pipeline';
export type { RawJobInput };

export type DiscoveryRegion = 'BR' | 'LATAM' | 'PT' | 'EU' | 'US' | 'GLOBAL' | 'ASIA' | 'OCEANIA';

export interface JobSource {
  id: string;
  name: string;
  category: string;
  regions: DiscoveryRegion[];
  adapter: DiscoveryAdapter;
  enabled: boolean;
  risky: boolean;
  requiresAuth: boolean;
  /** URL base ou template de busca. */
  url?: string;
  /** Endpoint JSON/RSS quando aplicável. */
  apiEndpoint?: string;
  /** Template de URL de busca; placeholders: {query}, {page}, {location}. */
  searchUrlTemplate?: string;
  /**
   * Página é SPA/JS-heavy: o adapter `html` usa `renderText` (browser
   * persistente) em vez do fetcher HTTP. Reuso de login via profileDir.
   */
  render?: boolean;
  /** Configuração específica do adapter (ex.: nome do ATS, slug da empresa, selectors). */
  adapterConfig?: Record<string, unknown>;
  robotsPolicy: 'allow' | 'disallow' | 'crawl-delay' | 'unknown';
  /** delay mínimo em ms entre requisições para este domínio; sobrescreve padrão. */
  minDelayMs?: number;
  /** Modelos de trabalho que a fonte cobre; ausente = todos. */
  workModels?: WorkModel[];
  notes?: string;
}

export interface ExtractedJob {
  title: string;
  url: string;
  company?: string;
  location?: string;
  description?: string;
}

/** Extrator genérico (LLM) de páginas de listagem sem API/RSS. */
export type GenericExtractor = (
  html: string,
  pageUrl: string,
  maxJobs: number,
) => Promise<ExtractedJob[]>;

export interface DiscoveryOptions {
  config: CareerOpsConfig;
  /** IDs específicos para executar. Se vazio, sourceRegistry aplica filtros de config. */
  sourceIds?: string[];
  /** Limite global de vagas. */
  maxJobs?: number;
  /** Sobrescreve discovery.maxJobsPerSource (rodadas de expansão pedem mais por fonte). */
  perSourceMax?: number;
  /** URLs já coletadas — removidas do resultado (dedup por host+path). */
  excludeUrls?: string[];
  /** Sinal para cancelamento. */
  signal?: AbortSignal;
  /** Extrator LLM para fontes html sem adapter específico (fallback genérico). */
  extract?: GenericExtractor;
  /**
   * Fetch via browser Playwright (contexto persistente = logins do usuário)
   * para fontes `render: true` — SPAs que não devolvem HTML útil no HTTP.
   */
  renderText?: (url: string) => Promise<{ url: string; text: string; status: number }>;
  /** Render interativo (scroll + "ver mais" + expandir DOM) — preferido quando existe. */
  renderPage?: RenderPageFn;
}

export interface DiscoveryJob {
  raw: RawJobInput;
  sourceId: string;
  sourceName: string;
  discoveredAt: string;
}

export interface DiscoveryResult {
  jobs: DiscoveryJob[];
  errors: DiscoveryError[];
  /** Resumo por fonte — preenchido pelo discoveryEngine. */
  perSource?: Array<{ sourceId: string; jobs: number; errors: number }>;
  meta: {
    sourcesTried: number;
    sourcesSucceeded: number;
    totalRaw: number;
    afterDedup: number;
    afterFilters: number;
    durationMs: number;
  };
}

export interface DiscoveryError {
  sourceId: string;
  phase: 'connect' | 'parse' | 'rate-limit' | 'robots' | 'unknown';
  message: string;
  url?: string;
}

/** Página viva mínima — executa JS no DOM e espera (sem depender de Playwright). */
export interface RenderPageHandle {
  evaluate<R>(fn: () => R | Promise<R>): Promise<R>;
  waitForTimeout(ms: number): Promise<void>;
}

/**
 * Render interativo: navega, roda `interact` na página viva (scroll, "ver
 * mais", expandir descrição) e só então captura o HTML final.
 */
export type RenderPageFn = (
  url: string,
  opts?: { interact?: (page: RenderPageHandle) => Promise<void>; scrollMax?: number },
) => Promise<{ url: string; text: string; status: number }>;

export interface SourceAdapterContext {
  config: CareerOpsConfig;
  source: JobSource;
  fetcher: Fetcher;
  signal?: AbortSignal;
  /** Número máximo de vagas a coletar desta fonte. */
  maxJobs: number;
  /** Extrator LLM disponível quando o fallback genérico está habilitado. */
  extract?: GenericExtractor;
  /** Fetch renderizado em browser persistente — fontes `render: true`. */
  renderText?: (url: string) => Promise<{ url: string; text: string; status: number }>;
  /**
   * Render interativo (scroll + "ver mais" + cliques de expansão no DOM).
   * Ausente → adapters usam `renderText` puro.
   */
  renderPage?: RenderPageFn;
}

export interface SourceAdapter {
  name: string;
  discover(ctx: SourceAdapterContext): Promise<DiscoveryResult>;
}

export interface Fetcher {
  fetchText(
    url: string,
    opts?: { method?: string; body?: string; headers?: Record<string, string> },
  ): Promise<{ url: string; text: string; status: number }>;
  fetchJson<T = unknown>(
    url: string,
    opts?: { method?: string; body?: string; headers?: Record<string, string> },
  ): Promise<{ url: string; data: T; status: number }>;
}

export type NormalizedJob = {
  url: string;
  title?: string;
  company?: string;
  location?: string;
  descriptionHtml?: string;
  descriptionMarkdown?: string;
  workModel?: string;
  contractType?: string;
  salaryRange?: string;
  postedAt?: string;
};

export interface SearchAdapter {
  buildQuery(source: JobSource, titles: string[], region: string): string | null;
  parseResults(html: string, source: JobSource): Array<{ url: string; title?: string }>;
  searchEngine?: SearchEngine;
}
