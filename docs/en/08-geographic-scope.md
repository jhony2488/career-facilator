# 10. Geographic Scope and Market Module (`src/geo/`)

This module controls where the system will search for jobs, how it filters visa/timezone restrictions and which language/currency will be used in the resume and answers.

## 10.1. Directory Structure

```text
career-facilitator-ts/
└── src/
    └── geo/
        ├── geoConfig.ts         # Active configuration: 'NATIONAL' | 'INTERNATIONAL' | 'BOTH'
        ├── dorkBuilder.ts       # Generates market- and language-specific search queries
        ├── eligibilityGuard.ts  # Filters visa, timezone and contract restrictions (CLT/PJ/B2B)
        └── localeAdapter.ts     # Switches CV language (PT-BR vs. EN-US) and salary expectation
```

## 10.2. Behavior per Market Mode

| Criterion | NATIONAL Mode (Brazil) | INTERNATIONAL Mode (Global) |
|-----------|------------------------|------------------------------|
| **Sources & Dorks** | Gupy, LinkedIn Brazil, GeekHunter, ProgramaThor, Greenhouse/Lever filtered by "Brasil" or "LATAM". | Greenhouse, Lever, Ashby, Wellfound, RemoteOK, Y Combinator, LinkedIn Global ("Remote" / "LATAM" / "Worldwide"). |
| **Eligibility Filter** (`eligibilityGuard.ts`) | Validates employment model (CLT or PJ), city/state (if hybrid) or national remote. | Blocks jobs with "US Citizens Only", "W2 only" or "Security Clearance". Prioritizes jobs with "LATAM", "Async", "Contractor / B2B". |
| **Resume Language & Answers** | Generates PDF and fills forms in Portuguese (PT-BR), keeping technical terms in English. | Automatically activates the `international-remote` skill, translates and adapts the PDF and answers to English (EN-US). |
| **Salary Expectation** | Calculates and fills the range in BRL (R$) according to the CLT/PJ regime. | Converts and fills the annual/monthly range in USD ($) following international market standards. |

---

« [Previous: Application Modes](07-application-modes.md) | [Index](README.md) | [Next: Configuration →](09-configuration.md)
