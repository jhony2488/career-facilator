import type {
  CareerOpsConfig,
  ExtractedProfile,
  JobPosting,
  JobTriageResult,
  MasterProfile,
  SkillMetadata,
  InspectedField,
} from './contracts';

export function makeConfig(overrides: Partial<CareerOpsConfig> = {}): CareerOpsConfig {
  return {
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
    discovery: {
      targetTitles: ['Senior Engineer'],
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
      retryBackoffMs: 0,
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
      retryBackoffMs: 0,
    },
    ...overrides,
  };
}

export function makeMasterProfile(overrides: Partial<MasterProfile> = {}): MasterProfile {
  return {
    fullName: 'Dev Tester',
    email: 'dev@example.com',
    phone: '+55 81 99999-0000',
    linkedin: 'https://linkedin.com/in/devtester',
    github: 'https://github.com/devtester',
    portfolio: 'https://devtester.dev',
    location: 'Recife, PE',
    summary: 'Senior Full-Stack TypeScript Engineer',
    coreStack: ['TypeScript', 'Node.js', 'Next.js', 'PostgreSQL'],
    seniorityYears: 6,
    experiences: [
      {
        role: 'Senior Full-Stack Engineer',
        company: 'TechCorp',
        period: '2021 — atual',
        highlights: ['Liderou migração multi-tenant', '-40% latency'],
      },
    ],
    projects: [
      {
        name: 'SaaS Analytics',
        summary: 'Multi-tenant dashboard platform',
        metrics: ['-40% latency'],
      },
    ],
    openSourceProjects: [],
    education: [{ course: 'Ciência da Computação', institution: 'UFPE', period: '2014 — 2018' }],
    languages: ['Português', 'Inglês'],
    certifications: [],
    blockedKeywords: ['estágio', 'junior', 'onsite only'],
    standardAnswers: {
      availability: 'Imediata',
      salaryExpectation: 'A combinar conforme faixa do mercado',
    },
    salaryExpectationBRL: 10000,
    salaryExpectationUSD: 4500,
    ...overrides,
  };
}

export function makeJob(overrides: Partial<JobPosting> = {}): JobPosting {
  return {
    id: 'job-001',
    url: 'https://boards.greenhouse.io/techcorp/jobs/123?utm_source=linkedin',
    canonicalUrl: 'https://boards.greenhouse.io/techcorp/jobs/123',
    contentHash: 'abc123',
    source: 'ATS_DIRECT',
    company: 'TechCorp',
    title: 'Senior Full-Stack Engineer',
    descriptionMarkdown:
      'We are looking for a Senior Full-Stack Engineer with TypeScript, Next.js, Node.js and PostgreSQL. Fully remote.',
    scope: 'INTERNATIONAL',
    status: 'DISCOVERED',
    discoveredAt: '2026-11-19T10:00:00.000Z',
    ...overrides,
  };
}

export function makeTriageResult(overrides: Partial<JobTriageResult> = {}): JobTriageResult {
  return {
    fitScore: 80,
    isDealbreaker: false,
    missingSkills: [],
    matchedKeywords: ['TypeScript', 'Next.js', 'PostgreSQL'],
    atsTitleSuggestion: 'Senior Full-Stack TypeScript Engineer',
    ...overrides,
  };
}

export function makeSkill(overrides: Partial<SkillMetadata> = {}): SkillMetadata {
  return {
    id: 'fullstack-ts',
    name: 'Full-Stack TypeScript & SaaS Architect',
    triggers: ['typescript', 'next.js', 'react', 'node', 'postgresql', 'full-stack', 'saas'],
    priority: 10,
    filePath: '/tmp/skills/fullstack-ts/SKILL.md',
    ...overrides,
  };
}

export function makeField(overrides: Partial<InspectedField> = {}): InspectedField {
  return { kind: 'input', label: 'Email', required: true, ...overrides };
}

export function makeExtractedProfile(overrides: Partial<ExtractedProfile> = {}): ExtractedProfile {
  const { seniorityYears, salaryExpectationBRL, salaryExpectationUSD, ...rest } = overrides;
  const base = makeMasterProfile(rest);
  return {
    ...base,
    seniorityYears: seniorityYears === undefined ? base.seniorityYears : seniorityYears,
    salaryExpectationBRL:
      salaryExpectationBRL === undefined ? base.salaryExpectationBRL : salaryExpectationBRL,
    salaryExpectationUSD:
      salaryExpectationUSD === undefined ? base.salaryExpectationUSD : salaryExpectationUSD,
  };
}
