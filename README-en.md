# CareerFacilator AI (TypeScript Edition)

Autonomous system for job prospecting, semantic triage, resume tailoring and assisted application with inference optimization.

> **Status:** complete specification + implementation — Jest suites green and a real Ollama client working (streaming + structured JSON). Discovery runs on public APIs/RSS; SMTP via nodemailer and WhatsApp via Evolution API are connected; Playwright browser automation is connected — real web forms are inspected and filled (see [Current limitations](#current-limitations)).

English version of the README. [Portuguese version (README.md)](README.md).

## What it is

CareerFacilator AI automates the end-to-end cycle of searching and applying to jobs (LinkedIn, Greenhouse, Lever, Gupy, Workday and custom portals) under a **3-layer Inference Optimization Funnel**:

| Layer                     | Function                                                               | Cost           |
| ------------------------- | ---------------------------------------------------------------------- | -------------- |
| **0 — Deterministic**     | DOM cleaning, deduplication, lexical filters, TF-IDF/BM25 fit          | Zero / 0ms     |
| **1 — Light models**      | Fit Score + structured requirements (local Ollama / Groq / Flash-Lite) | Low / fast     |
| **2 — Reasoning + cache** | Tailored resume and Q&A only for jobs ≥ 75% (prompt caching)           | High / precise |

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
AI_LOCAL_PROVIDER=ollama      # cheap triage → any local model
AI_LOCAL_MODEL=hermes3:latest
AI_FAST_PROVIDER=ollama       # fast fallback
AI_FAST_MODEL=hermes3:latest
AI_SMART_PROVIDER=deepseek    # reasoning + prompt cache
AI_SMART_MODEL=deepseek-chat  # provider default (~$0.60/day for 100 sends)
DEEPSEEK_API_KEY=sk-...

# optional tuning: OLLAMA_KEEP_ALIVE, AI_TEMPERATURE, AI_NUM_PREDICT,
# AI_EMBEDDINGS_ENABLED (semantic RAG via nomic-embed-text), LEXICAL_MIN_TERMS
```

Providers with a generation adapter: `ollama` + **any OpenAI-compatible** — `deepseek`, `groq`, `openai`, `kimi`/`moonshot`, `openrouter`, `together`, `gemini`-compat, or any other via `<PROVIDER>_BASE_URL` (`openaiCompatibleClient.ts`). The key is read from `<PROVIDER>_API_KEY`, the model from `<PROVIDER>_MODEL` or `AI_<TIER>_MODEL`. Native Anthropic and Gemini adapters do not exist yet (Gemini works through Google's OpenAI-compat endpoint). All documented in `.env.example`.

### Commands

```powershell
npm run cli                       # interactive shell (career> prompt) — dev, no build
npm run cli -- <command>          # single command in dev

npm run cli -- config               # model routing + resolved data paths
npm run cli -- import --pdf cv.pdf  # structures your CV via Ollama → profile.draft.md
npm run cli -- import --inbox       # processes pending PDFs in the inbox
npm run cli -- import --inbox --watch  # watches the folder: drop a PDF and it is processed
npm run cli -- run --jobs-file jobs.json --dry-run   # full funnel (jobs.json = [{url, html}])
npm run cli -- run                  # without --jobs-file, runs discovery on active sources
npm run cli -- discover             # lists discovered jobs (dry-run lists active sources)
npm run cli -- discover --max-jobs 10 --sources remoteok,remotive  # filtered discovery
npm run cli -- scan remoteok        # tests a single source and prints samples
npm run cli -- approve              # promotes the profile draft to profile.master.md
npm run cli -- review               # NEEDS_HUMAN_INPUT / READY_TO_REVIEW queue + WhatsApp queue
npm run cli -- mark <url> applied   # mark a manually completed application (email|whatsapp|skipped|failed|rejected|interview|assessment)
npm run cli -- remove <url>         # delete a job from history (re-eligible on the next run)
npm run cli -- status               # status counts from jobs.sqlite
npm run cli -- config check         # tests endpoint+model for all 3 tiers (preflight)
npm run cli -- vault set smtp-main  # stores encrypted SMTP credential (interactive in shell)
npm run cli -- vault list           # stored refs without exposing secrets
npm run cli -- whatsapp setup       # creates Evolution API instance + QR in terminal to pair
npm run cli -- whatsapp status      # WhatsApp connection state
npm run cli -- login <url|portal>   # visible browser for manual login (gupy|linkedin|indeed|vagas|infojobs|catho)
npm run cli -- help                 # full sectioned help (in the shell: 'help')

npm run build     # compiles TypeScript to dist/
npm run build:exe # builds the SEA executable (bundle + blob + postject → dist/career-<os>-<arch>)
npm run dist      # build:exe + career-runtime/ + packages career-<os>.zip and runtime tarball
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

Download the package from the [Releases](https://github.com/jhony2488/career-facilitator/releases) tab — **no Node.js required**:

| Package                   | First use                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| `career-windows-x64.zip`  | SmartScreen may warn (unsigned binary): "More info → Run anyway"                         |
| `career-macos-arm64.zip`  | `xattr -dr com.apple.quarantine <folder>` — frees exe + Chromium (Gatekeeper)            |
| `career-macos-x64.zip`    | same, for Intel                                                                          |
| `career-linux-x64.zip`    | `chmod +x`; Chromium may need system libs (`playwright install-deps chromium` equivalent) |

The ZIP ships the SEA executable + `career-runtime/` (Playwright + Chromium, pdf-parse, tesseract + tessdata) + `skills/` + `.env.example` — **every feature works like the source install** (form autofill, authenticated sources, post-image OCR, text-layer PDF). If you download just the binary (`career-<os>-<arch>[.exe]`), `career runtime setup` later fetches `career-runtime-<os>-<arch>.tar.gz` from the release; `runtime status` diagnoses what's missing. Without the runtime, web forms degrade to e-mail, WhatsApp or `NEEDS_HUMAN_INPUT`.

The executable uses the **same configuration** as the other modes: `career config init` creates `~/.careerfacilator/.env`, `config set|get` edits it, and a `.env` with `CAREER_HOME=.` next to the exe keeps data portable — the exe-folder `.env` outranks the working-directory `.env`. `career --version` shows the `package.json` version (the release validates the `v*` tag matches it). Full execution/configuration reference: [tutorials/en/08-release-executable.md](tutorials/en/08-release-executable.md).

Builds run on GitHub Actions (`.github/workflows/release.yml`): tag `v*` → Windows/macOS arm64+x64/Linux matrix (Node SEA single-file + runtime sidecar) → ZIPs and tarballs attached to the release.

### Ingesting your profile (resume)

1. Drop the PDF in `storage/profile_inbox/` (dev) or the `CAREER_HOME` inbox (global — see `career config path`) **and** run `import --inbox` — or directly: `import --pdf your-cv.pdf`
2. Processed PDFs move to `profile_inbox/processed/` — nothing is re-imported
3. The system generates `storage/profile.draft.md` — **review before approving** (anti-fabrication: nothing enters the profile without coming from your document or manual edit)
4. Approve with `approve` — the active profile lives at `src/config/profile.master.md` (editable by hand) and is compiled to `profile.master.json` (prompt-cache artifact)

> Without a configured model, `import` only validates the PDF and produces a minimal draft. Meanwhile, you can fill `profile.master.md` manually following the seed format (includes Open Source Projects section).

### Suggested usage sequence

1. Install and configure the AI ([tutorials 01–05](tutorials/en/README.md)) — `config check` must pass the LOCAL tier
2. Import your resume (`import --pdf`), review the draft and `approve`
3. Check discovery at zero AI cost: `discover --dry-run` and `scan <source>`
4. Run the funnel safely: `run --dry-run` → then `run`
5. Work the queue: `review` → `status`
6. Optional: send channels — email (`vault set smtp-main` + `EMAIL_*`) and WhatsApp (`whatsapp setup`)

Details for each step: [tutorial 07 — Usage sequence](tutorials/en/07-usage-sequence.md).

### Tests and verification

```powershell
npm run test        # unit + integration + e2e
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
├── feature/         # BDD/Gherkin specifications (14 .feature + DECISOES.md)
├── src/
│   ├── intake/      # Profile intake: PDF → structuring → master.md (doc 13)
│   ├── ai/          # Tier router, triage, tailorer (prompt cache), token tracker
│   ├── discovery/   # registry, sourceRegistry, engine, fetcher, genericExtractor (LLM) + adapters (api/rss/html; ats/search/linkedin stubs)
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
│   └── cli/         # entrypoint — interactive shell + commands (import/run/discover/scan/review/mark/remove/status/config)
├── bin/career.cjs   # wrapper for global CLI (npm link → career)
├── __tests__/       # Jest suites (contracts in helpers/contracts.ts)
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

Node.js v22+ · TypeScript strict · Jest + ts-jest · `node:sqlite` (builtin, no native dep → single-file exe) · node-html-parser + turndown · Zod · Playwright (connected) · Ollama/Groq/Anthropic/OpenAI/Kimi/Gemini via `.env`

## Current limitations

- **Cloud clients:** Ollama works for real (chat/streaming/embeddings + `format:'json'` + retry); **any OpenAI-compatible provider** works too via `openaiCompatibleClient` (`/chat/completions`, SSE streaming, `response_format` json_schema→json_object, usage metrics — deepseek/groq/openai/kimi/openrouter/together/gemini-compat or custom `<P>_BASE_URL`). Native Anthropic/Gemini adapters still missing — explicit error when used.
- **Discovery/browser:** `run` uses public API/RSS sources by default, still accepts `jobs.json` (`[{url, html}]`) via `--jobs-file`, and covers `html` sources without structure through the generic LLM fallback (`DISCOVERY_USE_GENERIC_FALLBACK`; model = `DISCOVERY_GENERIC_MODEL` or inherits `AI_LOCAL_*`, ollama provider) and `search` sources via search engine (DDG/Bing + per-query anti-bot fallback); Web forms are handled via Playwright — `pageFactory(url)` opens the job in a lazy Chromium (`AUTOFILL_HEADLESS`, `AUTOFILL_PROFILE_DIR` to reuse your logins), inspects fields (`pageInspector`), fills them with profile + AI answers (`executeLiveFill`), walks multi-step wizards, and submits or pauses per the score gate (`AUTO_SUBMIT`/`PAUSE_BEFORE_SUBMIT`); CAPTCHA/OTP/validation errors escalate to NEEDS_HUMAN_INPUT.
- **Channels:** real e-mail via nodemailer + AES-256-GCM vault (`vault set smtp-main`, docs/pt-BR/14); WhatsApp via manual queue or Evolution API (docs/pt-BR/15).
- **`import` without Ollama:** requires `ollama serve` + `ollama pull <model>`; without a configured client it only generates a minimal draft.
