export type ExecutionMode = 'FULL_AUTO' | 'SEMI_AUTO' | 'HYBRID_THRESHOLD';
export type MarketScope = 'NATIONAL' | 'INTERNATIONAL' | 'BOTH';
export type WorkModel = 'REMOTE' | 'HYBRID' | 'ONSITE';
export type ContractType = 'CLT' | 'PJ';
export type IntlRegion = 'WORLDWIDE' | 'LATAM' | 'AMERICAS_TIMEZONE';

export interface ModelRouting {
  provider: string;
  modelId: string;
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
  };
  ai: {
    local: ModelRouting; // Camada 1 — triagem barata (Ollama/ONNX)
    fast: ModelRouting; // Fallback rápido em nuvem (Groq/Flash-Lite)
    smart: ModelRouting; // Camada 2 — raciocínio + prompt cache
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
  profile: {
    inboxDir: string;
    draftPath: string;
    masterPath: string;
    compiledPath: string;
    historyDir: string;
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
      workModels: ['REMOTE'],
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
  profile: {
    inboxDir: 'storage/profile_inbox/',
    draftPath: 'storage/profile.draft.md',
    masterPath: 'src/config/profile.master.md',
    compiledPath: 'src/config/profile.master.json',
    historyDir: 'storage/profile_history/',
  },
};
