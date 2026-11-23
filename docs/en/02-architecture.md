# 2. System Architecture

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    0. PROFILE INTAKE (src/intake/)                      │
│  • User PDFs → extraction → MD draft → approval → compilation           │
│  • Produces the approved Master CV consumed by layers 1 to 3            │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    1. DISCOVERY & SCRAPER ENGINE                        │
│  • Playwright Stealth + Specific parsers (Greenhouse, Lever, etc.)      │
│  • DOM cleaning (HTML -> lean Markdown, removing nav/footer/ads)        │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                 2. TRIAGE FUNNEL & AI OPTIMIZATION                      │
│  [RegEx/Lexical Filter] ──► [Fast/Local LLM: Fit Score + JSON Schema]   │
│         (Discards 60%)               (Discards +25% | Score < 75)       │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ (Only Top 15% of Jobs)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│               3. ASSET GENERATOR (WITH PROMPT CACHING)                  │
│  • Fixed Cache: Master CV + Projects + Standard Answers                 │
│  • Output: Tailored Resume (PDF/DOCX) + Cover Letter + Q&A              │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│             4. AUTO-FILL & HUMAN-IN-THE-LOOP (PLAYWRIGHT)               │
│  • Semantic input mapping + Native SPA event injection                  │
│  • Mandatory pause before the "Submit" button (Approval / Captcha)      │
└─────────────────────────────────────────────────────────────────────────┘
```

## 3. Tech Stack (100% TypeScript)

- **Runtime & Language:** Node.js (v22+) / TypeScript (Strict Mode)
- **Browser Automation:** `playwright` + `playwright-extra` (Stealth plugin)
- **Clean Text Extraction:** `@mozilla/readability` + `turndown` (converts dirty HTML into minimal Markdown to save tokens)
- **AI Orchestration & Routing:** Vercel AI SDK (`ai`) + `zod` (for guaranteed Structured Outputs without format hallucination)
- **AI Providers (Hybrid Routing):**
  - *Local / Triage:* Ollama (`qwen2.5:7b` / `llama3.2`) and/or `@huggingface/transformers` (local embeddings)
  - *Optimized Cloud:* any OpenAI-compatible endpoint via `openaiCompatibleClient` — deepseek / groq / openai / kimi / openrouter / together / gemini-compat (`<P>_BASE_URL` for others); native Anthropic/Gemini adapters still missing
- **Local-First Database:** SQLite via `node:sqlite` builtin on Node 22+ (no native dep — enables single-file exe; state control, job history, spent token logs)
- **PDF Resume Generation:** `puppeteer` or `@react-pdf/renderer` (clean HTML/CSS templates optimized for parsing by ATS systems)

## 4. Project Directory Structure

```text
career-facilitator-ts/
├── src/
│   ├── config/
│   │   ├── profile.master.md        # Editable master profile (source of truth)
│   │   ├── profile.master.json      # Compiled from the MD — prompt cache artifact
│   │   ├── careerOps.config.ts      # Model routing, score thresholds and budget
│   │   ├── loadConfig.ts            # .env chain: <home> → ./.env → <exe>/.env (SEA) → process.env
│   │   ├── paths.ts                 # Data directory (CAREER_HOME → ~/.careerfacilator; relative anchors on exe in SEA)
│   │   └── envFile.ts               # .env key read/write (config set/unset)
│   ├── intake/
│   │   ├── intakeCore.ts            # Orchestrates the flow: inbox/command → approval → compile
│   │   ├── inboxScanner.ts          # Sweeps profile_inbox/ and archives PDFs into processed/
│   │   ├── pdfExtractor.ts          # Extracts the PDF text layer (no silent OCR)
│   │   ├── profileStructurer.ts     # Structures via LLM + Zod only what's in the doc
│   │   ├── masterProfileStore.ts    # Draft, merge/replace and version history
│   │   └── profileCompiler.ts       # Validates the MD and compiles the prompt cache JSON
│   ├── discovery/
│   │   ├── registry.ts              # Source catalog (APIs, ATS, job boards, search)
│   │   ├── sourceRegistry.ts        # Filters sources by allowlist/region/work model
│   │   ├── discoveryEngine.ts       # Orchestrates the run, URL dedup and RawJobInput
│   │   ├── genericExtractor.ts      # LLM fallback for pages without API/RSS (inherits AI_LOCAL_*)
│   │   ├── fetcher.ts               # HTTP with minimum per-domain delay
│   │   └── adapters/                # apiAdapter, rssAdapter, htmlAdapter, stubs (ats/search/linkedin)
│   ├── scraper/
│   │   ├── browser.ts               # Persistent Playwright instance (logged-in sessions)
│   │   ├── sessionVault.ts          # Encrypted cookies/storageState + jittered queue
│   │   ├── domCleaner.ts            # Removes scripts, CSS and boilerplate (saves ~70% tokens)
│   │   └── adapters/                # Optimized extractors (greenhouse.ts, lever.ts, linkedin.ts)
│   ├── ai/
│   │   ├── router.ts                # Dynamic model selector (Local vs. Fast vs. Smart)
│   │   ├── triageAgent.ts           # Evaluates Fit Score and extracts requirements via Zod
│   │   ├── tailorerAgent.ts         # Tailors the CV and generates answers using Prompt Caching
│   │   └── tokenTracker.ts          # Cost telemetry and tokens saved per run
│   ├── skills/
│   │   ├── core/                    # skillRegistry, skillSelector, skillInjector
│   │   └── library/                 # Declarative skills (SKILL.md + keywords.json)
│   ├── geo/
│   │   ├── geoConfig.ts             # 'NATIONAL' | 'INTERNATIONAL' | 'BOTH'
│   │   ├── dorkBuilder.ts           # Search queries per market and language
│   │   ├── eligibilityGuard.ts      # Filters visa, timezone and contract
│   │   └── localeAdapter.ts         # Switches CV language and salary expectation
│   ├── core/
│   │   ├── autonomyEngine.ts        # FULL_AUTO vs SEMI_AUTO decision engine
│   │   └── escalationHandler.ts     # CAPTCHA/OTP detector → NEEDS_HUMAN_INPUT
│   ├── generator/
│   │   ├── resumeBuilder.ts         # Compiles tailored data into ATS-friendly PDF
│   │   └── templates/               # Minimalist HTML/React templates
│   ├── autofill/
│   │   ├── formInspector.ts         # Maps page labels, aria-labels and placeholders
│   │   ├── deterministicMatcher.ts  # Fills standard data (CPF, GitHub, LinkedIn) without AI
│   │   ├── wizardNavigator.ts       # Navigation loop for multi-step forms
│   │   └── formExecutor.ts          # Fills inputs, selects, PDF upload and fires events
│   ├── email_application/
│   │   ├── emailAppCore.ts          # Orchestrator of the email application flow
│   │   ├── recipientResolver.ts     # Extraction, validation and deduplication of recipients
│   │   ├── emailComposer.ts         # Fixed subject + body via preferred template
│   │   ├── emailDispatcher.ts       # Review/send, transient retry and vault
│   │   ├── smtpTransport.ts         # Real transport via nodemailer
│   │   ├── credentialVault.ts       # AES-256-GCM credential vault
│   │   └── emailTracker.ts          # Persistence of logs, status and history
│   ├── whatsapp_application/
│   │   ├── whatsappResolver.ts      # WhatsApp number extraction + cooldown
│   │   ├── whatsappComposer.ts      # Message via template + resume PDF
│   │   ├── evolutionClient.ts       # Evolution API REST (sendText/sendMedia)
│   │   └── whatsappAppCore.ts       # Orchestrator: manual queue or API send
│   ├── utils/
│   │   ├── textTemplate.ts          # {{placeholder}} renderer for messages
│   │   ├── humanSim.ts              # Human pacing + realistic viewports (anti-bot)
│   │   └── runtimeModules.ts        # SEA exe runtime sidecar (career-runtime/ — playwright, pdf-parse, tesseract)
│   ├── tracker/
│   │   └── outcomeMonitor.ts        # Post-application feedback loop (IMAP/Gmail API)
│   ├── db/
│   │   ├── schema.ts                # Drizzle tables (jobs, applications, ai_usage_logs)
│   │   └── repository.ts            # URL/Hash deduplication and status control
│   └── cli/
│       └── index.ts                 # Interactive terminal interface to review and approve submissions
├── storage/
│   ├── career_facilitator.db        # Local SQLite database
│   ├── profile_inbox/               # Watched folder for user PDFs
│   ├── profile.draft.md             # Profile draft awaiting approval
│   ├── profile_history/             # Previous versions of the master profile
│   └── generated_resumes/           # PDFs generated on demand per job
├── package.json
└── tsconfig.json
```

---

« [Previous: Overview](01-overview.md) | [Index](README.md) | [Next: AI Optimization →](03-ai-optimization.md)

