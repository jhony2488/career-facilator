# CareerFacilator AI (TypeScript Edition)

Autonomous system for job prospecting, semantic triage, resume tailoring and assisted application with inference optimization.

> **Status:** complete specification + initial implementation — **44 Jest suites green** and a real Ollama client working (streaming + structured JSON). Browser automation (Playwright) and real SMTP are still not connected (see [Current limitations](#current-limitations)).

English version of the README. [Portuguese version (README.md)](README.md).

## What it is

CareerFacilator AI automates the end-to-end cycle of searching and applying to jobs (LinkedIn, Greenhouse, Lever, Gupy, Workday and custom portals) under a **3-layer Inference Optimization Funnel**:

| Layer | Function | Cost |
| ----- | -------- | ---- |
| **0 — Deterministic** | DOM cleaning, deduplication, lexical filters, TF-IDF/BM25 fit | Zero / 0ms |
| **1 — Light models** | Fit Score + structured requirements (local Ollama / Groq / Flash-Lite) | Low / fast |
| **2 — Reasoning + cache** | Tailored resume and Q&A only for jobs ≥ 75% (prompt caching) | High / precise |

## How to run

### Requirements

- Node.js v22+ and npm
- [Ollama](https://ollama.com) (optional, but recommended — zero cost for triage/structuring)

```powershell
npm install          # installs dependencies (Jest, tsx, esbuild, postject, node:sqlite builtin, …)
```

### Configuration (`.env`)

```powershell
Copy-Item .env.example .env    # then edit .env
```

Providers and models are configured **per tier** via `.env` — no need to touch code:

```env
AI_LOCAL_PROVIDER=ollama     # cheap triage → any local model
AI_LOCAL_MODEL=hermes3:latest
AI_FAST_PROVIDER=ollama      # fast fallback
AI_FAST_MODEL=hermes3:latest
AI_SMART_PROVIDER=anthropic  # reasoning + prompt cache
AI_SMART_MODEL=claude-haiku-4-5
ANTHROPIC_API_KEY=sk-ant-...

# optional tuning: OLLAMA_KEEP_ALIVE, AI_TEMPERATURE, AI_NUM_PREDICT,
# AI_EMBEDDINGS_ENABLED (semantic RAG via nomic-embed-text), LEXICAL_MIN_TERMS
```

Valid providers: `ollama`, `groq`, `anthropic`, `openai`, `kimi`, `gemini` (or any other name — the key is read from `<PROVIDER>_API_KEY`, the model from `<PROVIDER>_MODEL` or `AI_<TIER>_MODEL`). All documented in `.env.example`.

### Commands

```powershell
npm run cli                       # interactive shell (career> prompt) — dev, no build
npm run cli -- <command>          # single command in dev

npm run cli -- config               # model routing + resolved data paths
npm run cli -- import --pdf cv.pdf  # structures your CV via Ollama → profile.draft.md
npm run cli -- import --inbox       # processes pending PDFs in the inbox
npm run cli -- import --inbox --watch  # watches the folder: drop a PDF and it is processed
npm run cli -- run --jobs-file jobs.json --dry-run   # full funnel (jobs.json = [{url, html}])
npm run cli -- approve              # promotes the profile draft to profile.master.md
npm run cli -- review               # NEEDS_HUMAN_INPUT / READY_TO_REVIEW queue + WhatsApp queue
npm run cli -- status               # status counts from jobs.sqlite
npm run cli -- config check         # tests endpoint+model for all 3 tiers (preflight)
npm run cli -- vault set smtp-main  # stores encrypted SMTP credential (interactive in shell)
npm run cli -- vault list           # stored refs without exposing secrets
npm run cli -- whatsapp setup       # creates Evolution API instance + QR in terminal to pair
npm run cli -- whatsapp status      # WhatsApp connection state

npm run build     # compiles TypeScript to dist/
npm run build:exe # generates SEA blob (dist/bundle/) — OS binary injection is done in CI or manually
npm run start -- <command>   # runs the compiled build
```

### Global CLI (`career`)

```powershell
npm link            # once — registers 'career' and 'career-facilitator' in PATH
career              # interactive shell from any folder
career status       # single command
```

When installed globally, data goes to **`~/.careerfacilator/`** (or `CAREER_HOME=<dir>`): `jobs.sqlite`, `profile_inbox/`, `profile.master.*` and the global `.env`. Everything configurable via the command itself:

```powershell
career config init                        # creates ~/.careerfacilator + .env template
career config path                        # shows home and config file
career config set AI_SMART_PROVIDER groq  # writes to the global .env
career config set GROQ_API_KEY gsk_...    # keys stay out of code
career config get AI_LOCAL_MODEL
career config unset AI_LOCAL_MODEL
```

Individual paths override via env: `PROFILE_INBOX_DIR`, `PROFILE_DRAFT_PATH`, `PROFILE_MASTER_PATH`, `PROFILE_COMPILED_PATH`, `PROFILE_HISTORY_DIR`, `JOBS_DB_PATH`.

> **Detailed tutorials:** step-by-step install from the repository, global npm, release binaries and model configuration (including Ollama by RAM) are in [tutorials/README.md](tutorials/README.md).

> **Dev in repo:** the local `.env` sets `CAREER_HOME=.`, so data stays in `storage/` and `src/config/` as before.

### Standalone executable (GitHub Releases)

Download the binary from the [Releases](https://github.com/jhony2488/career-facilitator/releases) tab — **no Node.js required**:

| File | First use |
| ---- | --------- |
| `career-windows-x64.exe` | SmartScreen may warn (unsigned binary): "More info → Run anyway" |
| `career-macos-arm64` | `chmod +x` + `xattr -d com.apple.quarantine career-macos-arm64` (Gatekeeper) |
| `career-linux-x64` | `chmod +x` |

The executable uses the **same configuration** as the other modes: `career config init` creates `~/.careerfacilator/.env`, `config set|get` edits it, and a `.env` with `CAREER_HOME=.` next to the exe keeps data portable. For the skill library in binary mode, copy `src/skills/library/` to a `skills/` folder next to the executable.

> **Binary difference:** PDF extraction falls back to regex mode (no `pdf-parse`) — text-layer PDFs work normally. `career --version` shows the release tag.

Builds run on GitHub Actions (`.github/workflows/release.yml`): tag `v*` → Windows/macOS/Linux matrix (Node SEA single-file) → artifacts attached to the release.

### Ingesting your profile (resume)

1. Drop the PDF in `storage/profile_inbox/` (dev) or the `CAREER_HOME` inbox (global — see `career config path`) **and** run `import --inbox` — or directly: `import --pdf your-cv.pdf`
2. Processed PDFs move to `profile_inbox/processed/` — nothing is re-imported
3. The system generates `storage/profile.draft.md` — **review before approving** (anti-fabrication: nothing enters the profile without coming from your document or manual edit)
4. Approve with `approve` — the active profile lives at `src/config/profile.master.md` (editable by hand) and is compiled to `profile.master.json` (prompt-cache artifact)

> Without a configured model, `import` only validates the PDF and produces a minimal draft. Meanwhile, you can fill `profile.master.md` manually following the seed format (includes Open Source Projects section).

### Tests and verification

```powershell
npm run test        # 44 suites: unit + integration + e2e
npm run test:unit   # unit only
npm run lint        # ESLint
npm run format      # Prettier
npx tsc --noEmit    # typecheck
```

## Repository structure

```text
CareerFacilator/
├── docs/            # Architecture specification (16 docs)
│   ├── pt-BR/       # Portuguese version (source of truth)
│   └── en/          # English version
├── feature/         # BDD/Gherkin specifications (13 .feature + DECISOES.md)
├── src/
│   ├── intake/      # Profile intake: PDF → structuring → master.md (doc 13)
│   ├── ai/          # Tier router, triage, tailorer (prompt cache), token tracker
│   ├── scraper/     # domCleaner, sessionVault (AES-256-GCM)
│   ├── geo/         # dorkBuilder, eligibilityGuard, localeAdapter
│   ├── skills/      # core (registry/selector/injector) + library/ (SKILL.md + keywords.json)
│   ├── autofill/    # deterministicMatcher, wizardNavigator, formExecutor
│   ├── core/        # pipeline, autonomyEngine, escalationHandler
│   ├── email_application/  # resolver, composer (template), dispatcher, smtpTransport, credentialVault, tracker
│   ├── whatsapp_application/ # resolver, composer, evolutionClient, appCore (MANUAL_QUEUE|EVOLUTION_API)
│   ├── utils/       # textTemplate — shared {{placeholder}} renderer
│   ├── db/          # schema + repository (SQLite)
│   ├── tracker/     # outcomeMonitor
│   ├── generator/   # resumeBuilder
│   ├── config/      # careerOps.config + loadConfig + paths/envFile (.env, CAREER_HOME)
│   └── cli/         # entrypoint — interactive shell + commands (import/run/review/status/config)
├── bin/career.cjs   # wrapper for global CLI (npm link → career)
├── __tests__/       # 44 Jest suites (contracts in helpers/contracts.ts)
├── CONTRIBUTING.md  # Contribution guide (PT-BR) — CONTRIBUTING.en.md (EN)
└── AGENTS.md        # Guide for AI agents in this repo
```

## Documentation

- **[tutorials/README.md](tutorials/README.md)** — step-by-step install guides (repository, npm global, release binaries) and AI model configuration (Ollama and remote providers)
- **[docs/README.md](docs/README.md)** — general index (PT-BR + EN)
- **[docs/pt-BR/README.md](docs/pt-BR/README.md)** — architecture, AI optimization, skills, modes, geographic scope, reliability, e-mail and profile intake
- **[feature/README.md](feature/README.md)** — BDD scenarios covering all modules
- **[feature/DECISOES.md](feature/DECISOES.md)** — requirement ambiguities and pending decisions
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — workflow, commits (Conventional Commits) and PR rules

## Stack

Node.js v22+ · TypeScript strict · Jest + ts-jest · `node:sqlite` (builtin, no native dep → single-file exe) · node-html-parser + turndown · Zod · Playwright (to connect) · Ollama/Groq/Anthropic/OpenAI/Kimi/Gemini via `.env`

## Current limitations

- **Cloud clients:** Ollama works for real (chat/streaming/embeddings + `format:'json'` + retry). Groq/Anthropic/OpenAI/Kimi/Gemini are resolvable via `.env`, but without an adapter — explicit error when used.
- **Discovery/browser:** `run` consumes `jobs.json` (`[{url, html}]`); Playwright scraping is still not connected — `pageFactory` is a stub with no fields, so real forms are not filled.
- **Channels:** real e-mail via nodemailer + AES-256-GCM vault (`vault set smtp-main`, docs/pt-BR/14); WhatsApp via manual queue or Evolution API (docs/pt-BR/15).
- **`import` without Ollama:** requires `ollama serve` + `ollama pull <model>`; without a configured client it only generates a minimal draft.

## Next steps

See [docs/pt-BR/12-roadmap.md](docs/pt-BR/12-roadmap.md) — next: cloud adapters (Groq/Anthropic), Playwright discovery and real nodemailer.
