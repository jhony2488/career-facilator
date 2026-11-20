# Tests — CareerFacilator AI

Jest + ts-jest suites derived from the specs in `docs/pt-BR/` and `feature/*.feature`.

> **Status:** the tests import from `../src/`, which does not exist yet — they **do not compile/run** until the implementation begins. This is intentional (TDD/red-first): the tests are the executable spec of the modules.

## Structure

```text
__tests__/
├── helpers/
│   ├── contracts.ts    # Domain types + expected src/ signatures (SOURCE OF TRUTH)
│   ├── factories.ts    # Builders: makeJob, makeMasterProfile, makeTriageResult, makeConfig...
│   ├── mocks.ts        # Mocks of external deps: LLM, page state, SMTP, vault, repo
│   └── fixtures.ts     # Job HTML, SKILL.md, sample blocking texts
├── unit/               # Pure logic and decision boundaries (17 suites)
├── integration/        # Pipelines with mocked external deps (7 suites)
└── e2e/                # Full end-to-end flow with everything mocked (3 suites)
```

## Conventions

- **Traceability:** each `it()` references its source scenario with `// feature/NN: <name>` when it maps 1:1 to a Gherkin scenario.
- **Imports:** types come from `../helpers/contracts`; tested functions come from `../src/...` (path mirroring `src/`).
- **No external deps in tests:** never import `playwright`, `nodemailer`, or LLM SDKs — use the mocks in `helpers/mocks.ts`.
- **Determinism:** tests involving AI inject `mockTriageModel`/`mockTailorModel` — they never depend on a real model.
- **Config:** use `makeConfig()` with overrides — never hardcode thresholds outside the scenarios that explicitly test them.

## Provisional contracts

The expected signatures of each `src/` module are documented in [`helpers/contracts.ts`](helpers/contracts.ts). If the implementation diverges, discuss/update it there **before** changing tests in bulk.

## Commands (once `src/` exists and `npm install` has been run)

```powershell
npm run test:unit          # unit/ only
npm run test:integration   # integration/ only
npm run test:e2e           # e2e/ only
npm test                   # everything
```

## Feature → suites map

| Feature | Unit | Integration | E2E |
|---------|------|-------------|-----|
| 01-discovery | `geo/dorkBuilder` | — | `pipeline.happy-path` |
| 02-deduplicacao | — | `repository.sqlite` | `pipeline.*` |
| 03-triagem-fit-score | `ai/triageAgent`, `ai/router` | `triage-to-tailor` | `pipeline.*` |
| 04-skills | `skills/skillSelector`, `skills/skillInjector` | `triage-to-tailor` | `pipeline.*` |
| 05-geracao-curriculo | `ai/tokenTracker` | `triage-to-tailor` | `pipeline.*` |
| 06-autofill | `autofill/deterministicMatcher` | `autofill-pipeline`, `wizard-flow` | `pipeline.*` |
| 07-modos | `core/autonomyEngine` | — | `pipeline.full-auto` |
| 08-escopo-geo | `geo/eligibilityGuard`, `geo/localeAdapter` | — | — |
| 09-escalonamento | — | `escalation` | `pipeline.full-auto` |
| 10-email | `email/recipientResolver` | `email-application` | — |
| 11-sessao | — | `escalation` (expired session) | — |
| 12-tracking/dry-run | `tracker/outcomeMonitor` | — | `pipeline.dry-run` |
| 13-ingestao-perfil | `intake/pdfExtractor`, `intake/profileStructurer`, `intake/masterProfileStore`, `intake/profileCompiler` | `intake-pipeline` | — |
