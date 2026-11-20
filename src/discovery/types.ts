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
  /** Configuração específica do adapter (ex.: nome do ATS, slug da empresa, selectors). */
  adapterConfig?: Record<string, unknown>;
  robotsPolicy: 'allow' | 'disallow' | 'crawl-delay' | 'unknown';
  /** delay mínimo em ms entre requisições para este domínio; sobrescreve padrão. */
  minDelayMs?: number;
  /** Modelos de trabalho que a fonte cobre; ausente = todos. */
  workModels?: WorkModel[];
  notes?: string;
}

export interface DiscoveryOptions {
  config: CareerOpsConfig;
  /** IDs específicos para executar. Se vazio, sourceRegistry aplica filtros de config. */
  sourceIds?: string[];
  /** Limite global de vagas. */
  maxJobs?: number;
  /** Sinal para cancelamento. */
  signal?: AbortSignal;
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

export interface SourceAdapterContext {
  config: CareerOpsConfig;
  source: JobSource;
  fetcher: Fetcher;
  signal?: AbortSignal;
  /** Número máximo de vagas a coletar desta fonte. */
  maxJobs: number;
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
