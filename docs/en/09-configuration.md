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
