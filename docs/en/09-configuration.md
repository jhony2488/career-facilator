# 11. Central Configuration File (`src/config/careerOps.config.ts`)

Unifies autonomy control, precision scale and market selection into a single typed object:

```typescript
export interface CareerOpsConfig {
  execution: {
    mode: 'FULL_AUTO' | 'SEMI_AUTO' | 'HYBRID_THRESHOLD';
    minScoreForTailoring: number;   // E.g.: 75 (minimum to generate resume and prepare application)
    minScoreForFullAuto: number;    // E.g.: 88 (minimum to send autonomously without human intervention)
    maxDailyApplications: number;   // Daily safety lock (e.g.: 15 applications/day)
    companyCooldownDays: number;    // Do not reapply to the same company for X days
    maxJobsPerRun: number;          // Max jobs collected per discovery run (e.g.: 100)
    minJobsPerRun: number;          // Sent-applications target/run; below it discovery expands (0 = off)
    reviewExpirationDays: number;   // READY_TO_REVIEW expiration (e.g.: 7 days → SKIPPED)
    escalationTimeoutMinutes: number;          // Max wait for human intervention (e.g.: 15 min)
    maxEscalationsPerPlatformPerDay: number;   // Circuit breaker per platform (e.g.: 3/day)
  };
  autofill: {
    questionSimilarityThreshold: number;       // Min similarity to reuse a cached answer (e.g.: 0.9)
    fieldDefaults: Record<string, string>;     // Default values for fields missing from the profile
  };
  tracking: {
    emailMonitoring: boolean;       // Post-application monitoring — opt-in (default: false)
    outcomeConfidenceMin: number;   // Min confidence to auto-change status (e.g.: 0.8)
  };
  marketScope: {
    target: 'NATIONAL' | 'INTERNATIONAL' | 'BOTH';
    national: {
      enabled: boolean;
      workModels: Array<'REMOTE' | 'HYBRID' | 'ONSITE'>;
      allowedCities: string[];
      contracts: Array<'CLT' | 'PJ'>;
      salaryExpectationBRL: number;
    };
    international: {
      enabled: boolean;
      regions: Array<'WORLDWIDE' | 'LATAM' | 'AMERICAS_TIMEZONE'>;
      blockVisaRequired: boolean; // Discards jobs requiring visa sponsorship/local residency
      salaryExpectationUSD: number;
    };
  };
  profile: {
    inboxDir: string;      // Watched folder for resume PDFs (src/intake/)
    draftPath: string;     // Profile draft awaiting human approval
    masterPath: string;    // Active master profile (editable Markdown)
    compiledPath: string;  // Compiled JSON used in the prompt cache
    historyDir: string;    // Previous versions of the master profile
  };
  email: {                 // E-mail applications (docs 11/14)
    enabled: boolean;
    dispatchMode: 'REQUIRE_REVIEW' | 'HYBRID_BY_SCORE' | 'AUTO_SEND_HIGH_FIT';
    minScoreAutoSend: number;
    attachTailoredResume: boolean;
    maxDailyEmails: number;      // Daily cap — default 45
    smtpCredentialRef: string;   // Vault secret ref — never the password itself
    recipientCooldownDays: number;
    maxRetries: number;          // Transient → retry; exhausted → NEEDS_HUMAN_INPUT
    retryBackoffMs: number;
    bodyTemplatePath: string;    // Editable body template
    includeSalaryExpectation: boolean;
  };
  whatsapp: {              // WhatsApp applications (doc 15)
    enabled: boolean;
    mode: 'MANUAL_QUEUE' | 'EVOLUTION_API';
    apiUrlEnv: string;           // Env name holding the Evolution API URL
    apiInstance: string;
    apiKeyEnv: string;           // Env name holding the apikey
    bodyTemplatePath: string;
    recipientCooldownDays: number;
    attachResume: boolean;       // Sends the resume PDF
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
    minJobsPerRun: 0,
    reviewExpirationDays: 7,
    escalationTimeoutMinutes: 15,
    maxEscalationsPerPlatformPerDay: 3,
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
  email: {
    enabled: true,
    dispatchMode: 'HYBRID_BY_SCORE',
    minScoreAutoSend: 88,
    attachTailoredResume: true,
    maxDailyEmails: 45,
    smtpCredentialRef: 'smtp-main',
    recipientCooldownDays: 30,
    maxRetries: 3,
    retryBackoffMs: 60000,
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
    retryBackoffMs: 60000,
  },
};
```

## 11.1. Data directory and global CLI

Relative paths in `profile` and `storage/` (including `jobs.sqlite`) resolve under the **data directory**:

- `CAREER_HOME` — explicit directory override;
- `~/.careerfacilator` — default when the CLI runs globally installed (`npm link`/`npm i -g`, `career`/`career-facilitator` binary via `bin/career.cjs`);
- In repo development, the local `.env` pins `CAREER_HOME=.`, keeping data inside the project folder.

**Configuration precedence:** `defaults` < `<home>/.env` < `./.env` (project) < environment variables. Reading is handled by `src/config/loadConfig.ts` and path resolution by `src/config/paths.ts`.

**Individual path overrides (env):** `PROFILE_INBOX_DIR`, `PROFILE_DRAFT_PATH`, `PROFILE_MASTER_PATH`, `PROFILE_COMPILED_PATH`, `PROFILE_HISTORY_DIR`, `JOBS_DB_PATH` — relative values also resolve under `<home>`.

**Application channels (env):** `EMAIL_ENABLED`, `EMAIL_DISPATCH_MODE`, `EMAIL_MAX_DAILY`, `EMAIL_MIN_SCORE_AUTO_SEND`, `EMAIL_SMTP_CREDENTIAL_REF`, `EMAIL_COOLDOWN_DAYS`, `EMAIL_RETRY_MAX`, `EMAIL_RETRY_BACKOFF_MS`, `EMAIL_TEMPLATE_PATH`, `EMAIL_INCLUDE_SALARY` — see doc 14. `WHATSAPP_ENABLED`, `WHATSAPP_MODE`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `WHATSAPP_TEMPLATE_PATH`, `WHATSAPP_COOLDOWN_DAYS`, `WHATSAPP_ATTACH_RESUME`, `WHATSAPP_RETRY_*` — see doc 15. SMTP credentials live in the vault (`vault set`), never in env.

**Prospecting and fit thresholds (env):** `JOB_TITLES` — job titles to look for, comma/semicolon-separated (default: fullstack/backend dev); approximate matching, does not need to be exact (see `titleMatcher.ts`, doc 03 §5.5). `FIT_MIN_SCORE` — minimum fit to proceed to tailoring (default 75); `FIT_AUTO_SCORE` — fit for fully automatic sending without review (default 88). `LEXICAL_MIN_TERMS` — profile terms required in the job text by the Layer 0 filter (default 1).

**Discovery engine (env):** `DISCOVERY_SOURCES` — allowlist of source IDs (empty = enabled-by-default: `remoteok,remotive,jobicy,arbeitnow,workingnomads,himalayas,weworkremotely`); `DISCOVERY_EXCLUDE_SOURCES` — remove IDs from the run; `DISCOVERY_REGIONS` — filter source registry by region (`BR,LATAM,PT,EU,US,GLOBAL,ASIA,OCEANIA`); `DISCOVERY_WORK_MODELS` — restrict to `REMOTE`, `HYBRID`, `ONSITE`; `DISCOVERY_MAX_JOBS_PER_SOURCE` — cap per adapter (default 20); `DISCOVERY_MAX_JOBS_PER_RUN` — global cap per run; `DISCOVERY_MIN_JOBS_PER_RUN` — sent-application target per run: below it `run` expands collection (doubles the per-source cap each round, up to 3, excluding already-seen URLs) and the final report flags a missed target (default 0 = off); `DISCOVERY_CONCURRENCY` — concurrent sources (default 4); `DISCOVERY_PER_DOMAIN_DELAY_MS` — minimum delay per host (default 1500); `DISCOVERY_USE_GENERIC_FALLBACK` — LLM job extraction for HTML pages without API/RSS (default true); `DISCOVERY_GENERIC_MODEL` — extractor model (empty = inherits `AI_LOCAL_*`; ollama provider only for now); `DISCOVERY_SEARCH_ENGINE` — `duckduckgo` | `bing` | `none` (organic search; the other engine becomes a per-query fallback); `DISCOVERY_SEARCH_RESULT_LIMIT` — cap of results per query (default 30); `DISCOVERY_BROWSER_PROFILE_DIR`, `DISCOVERY_RESPECT_ROBOTS_TXT` — reserved (authenticated LinkedIn, robots.txt). `run` without `--jobs-file` runs discovery; `discover`/`scan` are standalone commands. **National eligibility:** `NATIONAL_WORK_MODELS` — accepted work models for BR jobs (default `REMOTE,HYBRID`); `ALLOWED_CITIES` — permitted cities for hybrid jobs (default `Recife,Jaboatão dos Guararapes`): hybrids that don't mention one are rejected (`Cidade híbrida fora da lista permitida`).

**Salary expectation (env):** `SALARY_BRL`/`SALARY_USD` — default expectation when the job states no level (default 10000/4500). `SALARY_{BRL,USD}_{JUNIOR,PLENO,SENIOR}` — expectation per level detected in the job title (`junior`/`pleno`/`senior`/`lead`/`staff`…). `SALARY_ADAPT_TO_RANGE=true` (default) — when the job's salary range pays **less** than the expectation, the system asks for the range ceiling instead of exceeding it; it never inflates above the base expectation. See `salaryResolver.ts`.

**Semantic embeddings (env):** `AI_EMBEDDINGS_ENABLED=true` enables the probabilistic layer: `OLLAMA_EMBED_MODEL` (default `nomic-embed-text`) via Ollama's `/api/embed`. Powers two features: profile RAG for tailoring (`retrieveHybrid`, lexical+semantic fusion via RRF) and semantic `JOB_TITLES` matching (fallback when the deterministic layer finds no match — cosine ≥ 0.72). `false`/absent → both run deterministically at zero cost.

```powershell
ollama pull nomic-embed-text                          # once — ~270 MB
career config set AI_EMBEDDINGS_ENABLED true          # writes to the home .env

# warms the model and validates the endpoint (response: {"embeddings": [[...]]} )
curl.exe http://localhost:11434/api/embed -d '{\"model\": \"nomic-embed-text\", \"input\": \"warmup\", \"keep_alive\": -1}'
```

> **Note:** embedding models do not respond on `/api/generate` — the correct endpoint is `/api/embed`.

**Configuration through the CLI itself** — no manual file editing:

```powershell
career config init                        # creates <home>/, subfolders and .env template
career config path                        # shows home and the config file
career config set AI_SMART_PROVIDER groq  # writes to <home>/.env
career config get AI_LOCAL_MODEL          # effective value (warns if local .env shadows it)
career config unset AI_LOCAL_MODEL
career config check                     # preflight: tests endpoint+model of all 3 tiers
```

**AI preflight + fallback** — before any LLM-using command (`import`, `run`), the CLI tests the endpoint+model of the tier(s) it needs and shows `OK`/`FAILED — reason`. On failure, the tier's `fallback` routing is offered: the interactive shell asks `[y/N]`; a direct command fails with a hint. `AI_<TIER>_FALLBACK` grammar: `off` | `local`/`fast`/`smart` | `<provider>:<model>` — spec default `local→fast`, `smart→fast`, `fast→off`. `AI_FALLBACK_ENABLED=false` disables all; `AI_PREFLIGHT_ENABLED=false` skips checks; `AI_PREFLIGHT_TIMEOUT_MS=8000` per probe.

## 12. Updated Full Flow

```text
[ Config: target = 'INTERNATIONAL' | mode = 'FULL_AUTO' ]
                           │
                           ▼
[ dorkBuilder.ts ] ──► Searches jobs on global portals (EN)
                           │
                           ▼
[ SQLite Deduplication + eligibilityGuard.ts ]
  (Discards jobs already applied to or requiring "US Citizen Only")
                           │
                           ▼
[ triageAgent.ts (Layer 1 AI) ] ──► Calculates real Fit Score against your CV
                           │
         ┌─────────────────┴─────────────────┐
         ▼ (Score < 88%)                     ▼ (Score >= 88% - Perfect Match)
[ SEMI_AUTO Queue (Review) ]        [ Skill: international-remote + fullstack-ts ]
                                                     │
                                                     ▼
                                    [ Generates English PDF + Fills Form ]
                                                     │
                                                     ▼
                                    [ Clicks "Submit" Automatically ]
                                                     │
                                                     ▼
                                    [ Records in SQLite (status: APPLIED) ]
```

**Summary:** Configurable Execution Modes (FULL_AUTO vs. SEMI_AUTO) with Match Threshold (strict precision scale so the system only applies automatically to jobs with a very high match to the resume), combined with the Geographic Scope Module (`src/geo/`) to filter, route and adapt applications between the National (Brazil), International (Global/USD) or Hybrid markets.

---

« [Previous: Geographic Scope](08-geographic-scope.md) | [Index](README.md) | [Next: Reliability →](10-reliability.md)
