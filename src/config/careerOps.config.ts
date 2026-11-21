export type ExecutionMode = 'FULL_AUTO' | 'SEMI_AUTO' | 'HYBRID_THRESHOLD';
export type MarketScope = 'NATIONAL' | 'INTERNATIONAL' | 'BOTH';
export type WorkModel = 'REMOTE' | 'HYBRID' | 'ONSITE';
export type ContractType = 'CLT' | 'PJ';
export type IntlRegion = 'WORLDWIDE' | 'LATAM' | 'AMERICAS_TIMEZONE';
export type DiscoveryAdapter = 'api' | 'rss' | 'ats' | 'html' | 'search' | 'linkedin';
export type SearchEngine = 'duckduckgo' | 'bing' | 'none';
export type EmailDispatchMode = 'REQUIRE_REVIEW' | 'HYBRID_BY_SCORE' | 'AUTO_SEND_HIGH_FIT';
export type WhatsappMode = 'MANUAL_QUEUE' | 'EVOLUTION_API';

export interface ModelRouting {
  provider: string;
  modelId: string;
  /** Endpoint do provider (ex.: http://localhost:11434 para Ollama). */
  baseUrl?: string;
  /** Nome da env var que contém a API key do provider (ex.: GROQ_API_KEY). Ollama: sem chave. */
  apiKeyEnv?: string;
  /**
   * Roteamento de fallback p/ quando o preflight falha neste tier (doc 03):
   * ModelRouting = usar esse provider/modelo; 'off' = sem fallback.
   * Default da spec: local→fast, smart→fast, fast→off. AI_<TIER>_FALLBACK sobrescreve.
   */
  fallback?: ModelRouting | 'off';
}

export interface CareerOpsConfig {
  execution: {
    mode: ExecutionMode;
    minScoreForTailoring: number;
    minScoreForFullAuto: number;
    maxDailyApplications: number;
    companyCooldownDays: number;
    maxJobsPerRun: number;
    reviewExpirationDays: number;
    escalationTimeoutMinutes: number;
    maxEscalationsPerPlatformPerDay: number;
    /** Termos do perfil que devem aparecer na vaga p/ não pular (filtro Camada 0). Default 1. */
    lexicalMinTerms?: number;
  };
  /** Prospecção: o que o sistema procura. */
  discovery: {
    /** Títulos de cargo a procurar (JOB_TITLES env — sobrescreve). */
    targetTitles: string[];
    /** Allowlist de IDs do registry. Vazio/null = todas ativas (menos risky). */
    sources?: string[];
    /** Blocklist de IDs do registry. */
    excludeSources?: string[];
    /** Filtro de região (BR, LATAM, PT, EU, US, GLOBAL, ASIA, OCEANIA). */
    regions?: string[];
    /** Filtro de modelo de trabalho. */
    workModels?: WorkModel[];
    /** Máximo de vagas por fonte em uma execução. */
    maxJobsPerSource: number;
    /** Requisições simultâneas globais. */
    concurrency: number;
    /** Delay mínimo entre requisições ao mesmo domínio (ms). */
    perDomainDelayMs: number;
    /** Motor de busca orgânica fallback (nenhum por padrão). */
    searchEngine: SearchEngine;
    /** Quantidade de resultados de busca a considerar. */
    searchResultLimit: number;
    /** Usar HTML genérico + LLM quando nenhum adapter específico atender. */
    useGenericHtmlFallback: boolean;
    /** Modelo para extração genérica de HTML; vazio = herda AI_LOCAL_MODEL. */
    genericExtractionModel: string;
    /** Diretório de perfil persistente do navegador (LinkedIn etc.). */
    browserProfileDir?: string;
    /** Verificar e respeitar robots.txt das fontes. */
    respectRobotsTxt: boolean;
  };
  ai: {
    local: ModelRouting; // Camada 1 — triagem barata (Ollama/ONNX)
    fast: ModelRouting; // Fallback rápido em nuvem (Groq/Flash-Lite)
    smart: ModelRouting; // Camada 2 — raciocínio + prompt cache
    /** Embeddings p/ RAG semântico (opcional — léxico é o default). */
    embeddings?: { enabled: boolean; modelId: string };
  };
  autofill: {
    questionSimilarityThreshold: number;
    fieldDefaults: Record<string, string>;
  };
  tracking: {
    emailMonitoring: boolean;
    outcomeConfidenceMin: number;
  };
  marketScope: {
    target: MarketScope;
    national: {
      enabled: boolean;
      workModels: WorkModel[];
      allowedCities: string[];
      contracts: ContractType[];
      salaryExpectationBRL: number;
    };
    international: {
      enabled: boolean;
      regions: IntlRegion[];
      blockVisaRequired: boolean;
      salaryExpectationUSD: number;
    };
  };
  /** Pretensão salarial por nível de senioridade + adaptação à faixa da vaga. */
  salary: {
    /** Vaga paga menos que a pretensão → estipula o teto da faixa dela. */
    adaptToJobRange: boolean;
    /** Pretensão por nível detectado no título da vaga (SALARY_<CUR>_<LEVEL>). */
    byLevel: {
      JUNIOR: { brl: number; usd: number };
      PLENO: { brl: number; usd: number };
      SENIOR: { brl: number; usd: number };
    };
  };
  profile: {
    inboxDir: string;
    draftPath: string;
    masterPath: string;
    compiledPath: string;
    historyDir: string;
  };
  /** Candidatura por e-mail (doc 11) — credenciais SMTP só via cofre. */
  email: {
    enabled: boolean;
    dispatchMode: EmailDispatchMode;
    minScoreAutoSend: number;
    attachTailoredResume: boolean;
    /** Teto diário de e-mails p/ proteger a reputação do remetente. Default 45. */
    maxDailyEmails: number;
    /** Referência do segredo SMTP no cofre — nunca a senha em si. */
    smtpCredentialRef: string;
    recipientCooldownDays: number;
    /** Retry em falha transitória; esgotadas → NEEDS_HUMAN_INPUT (DECISOES). */
    maxRetries: number;
    retryBackoffMs: number;
    /** Template do corpo (arquivo editável) — fallback p/ built-in. */
    bodyTemplatePath: string;
    includeSalaryExpectation: boolean;
  };
  /** Candidatura por WhatsApp (doc 15): fila manual ou Evolution API. */
  whatsapp: {
    enabled: boolean;
    mode: WhatsappMode;
    /** Nome da env var com a base URL da Evolution API (self-hosted). */
    apiUrlEnv: string;
    apiInstance: string;
    /** Nome da env var com a apikey da Evolution API. */
    apiKeyEnv: string;
    bodyTemplatePath: string;
    recipientCooldownDays: number;
    attachResume: boolean;
    maxRetries: number;
    retryBackoffMs: number;
  };
}

export const defaultCareerOpsConfig: CareerOpsConfig = {
  execution: {
    mode: 'HYBRID_THRESHOLD',
    minScoreForTailoring: 75,
    minScoreForFullAuto: 88,
    maxDailyApplications: 15,
    companyCooldownDays: 30,
    maxJobsPerRun: 100,
    reviewExpirationDays: 7,
    escalationTimeoutMinutes: 15,
    maxEscalationsPerPlatformPerDay: 3,
    lexicalMinTerms: 1,
  },
  discovery: {
    targetTitles: [
      'Desenvolvedor Full Stack',
      'Full Stack Developer',
      'Desenvolvedor Backend',
      'Backend Developer',
      'Node.js Developer',
    ],
    sources: [],
    excludeSources: [],
    regions: [],
    workModels: ['REMOTE', 'HYBRID'],
    maxJobsPerSource: 20,
    concurrency: 4,
    perDomainDelayMs: 1500,
    searchEngine: 'none',
    searchResultLimit: 30,
    useGenericHtmlFallback: true,
    genericExtractionModel: '',
    respectRobotsTxt: true,
  },
  ai: {
    local: { provider: 'ollama', modelId: 'qwen2.5:7b' },
    fast: { provider: 'groq', modelId: 'llama-3.1-8b-instant' },
    smart: { provider: 'anthropic', modelId: 'claude-haiku-4-5' },
  },
  autofill: {
    questionSimilarityThreshold: 0.9,
    fieldDefaults: {},
  },
  tracking: {
    emailMonitoring: false,
    outcomeConfidenceMin: 0.8,
  },
  marketScope: {
    target: 'BOTH',
    national: {
      enabled: true,
      workModels: ['REMOTE', 'HYBRID'],
      allowedCities: ['Recife', 'Jaboatão dos Guararapes'],
      contracts: ['PJ', 'CLT'],
      salaryExpectationBRL: 10000,
    },
    international: {
      enabled: true,
      regions: ['WORLDWIDE', 'LATAM', 'AMERICAS_TIMEZONE'],
      blockVisaRequired: true,
      salaryExpectationUSD: 4500,
    },
  },
  salary: {
    adaptToJobRange: true,
    byLevel: {
      JUNIOR: { brl: 5000, usd: 2500 },
      PLENO: { brl: 10000, usd: 4500 },
      SENIOR: { brl: 16000, usd: 7000 },
    },
  },
  profile: {
    inboxDir: 'storage/profile_inbox/',
    draftPath: 'storage/profile.draft.md',
    masterPath: 'src/config/profile.master.md',
    compiledPath: 'src/config/profile.master.json',
    historyDir: 'storage/profile_history/',
  },
  email: {
    enabled: true,
    dispatchMode: 'HYBRID_BY_SCORE',
    minScoreAutoSend: 88,
    attachTailoredResume: true,
    maxDailyEmails: 45,
    smtpCredentialRef: 'smtp-main',
    recipientCooldownDays: 30,
    maxRetries: 3,
    retryBackoffMs: 60_000,
    bodyTemplatePath: 'storage/email_template.md',
    includeSalaryExpectation: true,
  },
  whatsapp: {
    enabled: true,
    mode: 'MANUAL_QUEUE',
    apiUrlEnv: 'EVOLUTION_API_URL',
    apiInstance: 'default',
    apiKeyEnv: 'EVOLUTION_API_KEY',
    bodyTemplatePath: 'storage/whatsapp_template.md',
    recipientCooldownDays: 30,
    attachResume: true,
    maxRetries: 3,
    retryBackoffMs: 60_000,
  },
};
