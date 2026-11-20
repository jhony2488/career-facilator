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
```

## 11.1. Data directory and global CLI

Relative paths in `profile` and `storage/` (including `jobs.sqlite`) resolve under the **data directory**:

- `CAREER_HOME` — explicit directory override;
- `~/.careerfacilator` — default when the CLI runs globally installed (`npm link`/`npm i -g`, `career`/`career-facilitator` binary via `bin/career.cjs`);
- In repo development, the local `.env` pins `CAREER_HOME=.`, keeping data inside the project folder.

**Configuration precedence:** `defaults` < `<home>/.env` < `./.env` (project) < environment variables. Reading is handled by `src/config/loadConfig.ts` and path resolution by `src/config/paths.ts`.

**Individual path overrides (env):** `PROFILE_INBOX_DIR`, `PROFILE_DRAFT_PATH`, `PROFILE_MASTER_PATH`, `PROFILE_COMPILED_PATH`, `PROFILE_HISTORY_DIR`, `JOBS_DB_PATH` — relative values also resolve under `<home>`.

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
