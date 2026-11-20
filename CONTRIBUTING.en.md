# Contributing Guide — CareerFacilator AI

_Versão em português: [CONTRIBUTING.md](CONTRIBUTING.md)_

Thanks for contributing! This document defines the project's workflow, style and quality rules.

## Workflow

1. **Fork + branch:** branch off `main` named `feat/`, `fix/`, `docs/`, or `chore/` + short description (e.g. `feat/triage-fallback`).
2. **TDD first:** `__tests__/` is the executable spec — write/adjust the test before the implementation.
3. **Before implementing a module**, read the matching doc in `docs/en/` and the `.feature` in `feature/`, and check `feature/DECISOES.md` for pending decisions.
4. **Verify locally** before opening a PR:

```powershell
npm run lint         # ESLint
npm run format:check # Prettier
npx tsc --noEmit     # Typecheck
npm run test         # 36 Jest suites
```

## PR rules

### Size: maximum of 20 files per PR

PRs must be small and reviewable. The guideline is **up to 20 changed files** (excluding lockfiles) — verified in review.

**Justified exceptions** — exceeding the limit is allowed when:

- The change is structural and indivisible (e.g. initial `src/` creation, framework migration);
- It's a purely mechanical refactor (rename/reorganization) with no behavior change;
- It's tool-generated (lockfile, codegen).

In those cases, **explain in the PR body**: why it can't be split and how the reviewer should navigate it (reading order, central files).

### PR content

- Title in Conventional Commits format (e.g. `feat(intake): extract PDF text layer`).
- Body with: **what**, **why**, **how to test**, and a reference to the `.feature`/doc when applicable.
- One subject per PR — don't mix feature + refactor + docs.

## Commit rules (Conventional Commits)

Format: `<type>(<scope>): <short imperative description>`

| Type | Use |
|------|-----|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `test` | Tests only |
| `refactor` | Internal change, no behavior change |
| `perf` | Performance |
| `chore` | Build, deps, config |
| `style` | Formatting (no logic) |
| `ci` | Pipelines/CI |

Suggested scopes: `intake`, `ai`, `scraper`, `geo`, `skills`, `autofill`, `core`, `email`, `db`, `tracker`, `cli`, `config`.

Examples:

```text
feat(triage): add local→cloud fallback on model failure
fix(repository): normalize canonical URL stripping utm_*
docs(13): document open source projects section
test(e2e): cover deferral on daily limit
```

Additional rules:

- Small, atomic commits — one idea per commit.
- **Never commit secrets** — SMTP credentials/sessions live in the AES-256-GCM vault, never in the repository.

## Code style

- **Strict TypeScript** — no implicit `any`; domain types prefer exported `type`/`interface`.
- **ESLint + Prettier** are the source of truth for style: run `npm run lint` and `npm run format` before committing (or enable format-on-save with `.editorconfig`).
- **Dependency injection:** modules never import Playwright, SMTP or LLM SDKs in testable code — they receive them via `deps`.
- **Anti-fabrication (doc 13):** no user profile data may be inferred/invented — absent fields stay `NÃO_INFORMADO`/`null`.
- **Human-in-the-loop:** no flow may submit an application without respecting the configured execution mode.
- **Test descriptions in English:** `describe`/`it` titles and comments inside `__tests__/` are always in English (the source `.feature` scenarios stay in PT).

## Structure

- `docs/pt-BR/` + `docs/en/` — specification (always in pairs; change one, change the other)
- `feature/*.feature` — BDD scenarios in Gherkin PT (`# language: pt`)
- `__tests__/` — Jest suites; `src/` contracts in `helpers/contracts.ts`
- `src/` — per-module implementation (see `docs/en/02-architecture.md`)

## Proposing spec changes

Behavioral changes start in the spec: adjust the `.feature` and matching doc, update `feature/DECISOES.md` if the decision is pending, and only then implement.
