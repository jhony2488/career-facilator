# Tutorial 08 — Release executable: full execution & configuration guide

Detailed reference for the distributed binary: what ships in the package, how to run on each OS, and how to configure **every** feature without installing Node.js. Basic install is covered in [Tutorial 03](03-release-binary-install.md).

## 1. What's in the package

```
career-<os>-<arch>/
├── career.exe | career        # single executable (Node SEA — the whole app)
├── career-runtime/            # resources that don't fit in one file:
│   ├── node_modules/          #   playwright + stealth, pdf-parse, tesseract.js
│   ├── browsers/              #   Playwright Chromium (autofill + login + render)
│   └── tessdata/              #   por.traineddata + eng.traineddata (offline OCR)
├── skills/                    # dynamic skills library (SKILL.md + keywords)
└── .env.example               # reference for every variable
```

Why does `career-runtime/` exist? Modules like Playwright and Tesseract.js load their own files from disk (drivers, worker scripts, WASM, browsers) — they cannot live inside a single-file binary. Instead of losing features, the executable loads them from this sibling folder. With the full runtime, **every command works exactly like the source install**.

## 2. Installation per OS

### Windows

```powershell
Expand-Archive career-windows-x64.zip -DestinationPath C:\Tools\CareerFacilator
C:\Tools\CareerFacilator\career-windows-x64\career.exe --version
```

- SmartScreen: **More info → Run anyway** (unsigned binary).
- Antivirus: some may flag the Chromium inside `career-runtime/browsers/` — it is the official Playwright build; allow the folder.

### macOS

```bash
unzip career-macos-arm64.zip        # or career-macos-x64.zip (Intel)
cd career-macos-arm64
xattr -dr com.apple.quarantine .    # removes Gatekeeper quarantine for the whole folder
./career --version
```

`xattr -dr` is required on the **entire folder** — the Chromium inside `career-runtime/` is quarantined too.

### Linux

```bash
unzip career-linux-x64.zip
cd career-linux-x64
chmod +x career
./career --version
```

Chromium needs system libraries. On Debian/Ubuntu:

```bash
sudo apt install libatk1.0-0 libatk-bridge2.0-0 libcups2 libnss3 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
  libasound2 libpango-1.0-0 libcairo2
```

Without those libs only web forms fail — everything else still works.

## 3. Running commands

Always point at the binary path or cd into its folder. Optionally add the folder to `PATH`:

```powershell
# Windows (PowerShell) — current session
$env:PATH += ";C:\Tools\CareerFacilator\career-windows-x64"

# Linux/macOS (bash)
export PATH="$PATH:$(pwd)"
alias career='./career'   # PATH-free alternative
```

Commands below are written as `career <cmd>` — replace with `career.exe` on Windows if not on PATH. With no arguments, `career` opens the **interactive shell** (`career>`) with the same commands.

## 4. Executable runtime

```powershell
career runtime status    # diagnostics: node_modules, browsers, tessdata, skills
career runtime setup     # downloads career-runtime-<os>-<arch>.tar.gz from the release and extracts beside the exe
```

- `runtime setup` picks the right platform by itself (Windows/macOS arm64/macOS x64/Linux) and only needs internet access.
- `CAREER_RUNTIME=/path/to/career-runtime` points the runtime elsewhere (e.g. one shared runtime for several installs).
- Without the runtime: API/RSS discovery, triage, e-mail, WhatsApp, review queue and vault all work; web forms and login-based sources degrade to `NEEDS_HUMAN_INPUT`/message channels — nothing breaks, it just degrades.

## 5. Configuration — full precedence chain

Precedence (strongest wins):

```
environment variables (set/export)
    ↑
.env in the executable's folder
    ↑
.env in the working directory (cwd)
    ↑
.env in the data directory (<CAREER_HOME>/.env)
    ↑
code defaults
```

### Two ways to configure

**Global (recommended for personal use):**

```powershell
career config init        # creates ~/.careerfacilator/ with .env + folders
career config path        # shows where the effective .env lives
career config set KEY value
career config get KEY     # effective value (warns if another file shadows it)
```

**Portable (everything in the exe folder — USB stick, cloud folder, etc.):**

Create `.env` next to the executable with `CAREER_HOME=.` — data, config, vault and sessions all live in that folder. This `.env` already outranks the cwd `.env`; only real environment variables beat it.

> `career config set` always writes to the home `.env`. To edit the exe `.env`, open the file directly.

## 6. Configuring the AI

### 6.1 Local Ollama (free, default)

The executable **does not install Ollama** — install it separately (see [Tutorial 04](04-setting-up-ollama.md) for download and models by RAM):

```powershell
ollama pull qwen2.5:7b
career config set AI_LOCAL_PROVIDER ollama
career config set AI_LOCAL_MODEL qwen2.5:7b
career config set AI_FAST_PROVIDER ollama
career config set AI_FAST_MODEL qwen2.5:7b
career config set AI_SMART_PROVIDER ollama
career config set AI_SMART_MODEL qwen2.5:7b
career config set OLLAMA_BASE_URL http://localhost:11434
career config check        # preflight: tests each tier against the provider
```

`OLLAMA_BASE_URL` accepts another host/port (remote GPU, Docker, WSL).

### 6.2 Remote providers (OpenAI-compatible)

One adapter covers `deepseek`, `groq`, `openai`, `kimi`/`moonshot`, `openrouter`, `together` and any custom OpenAI-compatible endpoint via `<PROVIDER>_BASE_URL`:

```powershell
career config set AI_SMART_PROVIDER groq
career config set AI_SMART_MODEL llama-3.3-70b-versatile
career config set GROQ_API_KEY gsk_...
```

| Provider          | API key env          | Base URL env (custom)        |
| ----------------- | -------------------- | ---------------------------- |
| `deepseek`        | `DEEPSEEK_API_KEY`   | `DEEPSEEK_BASE_URL`          |
| `groq`            | `GROQ_API_KEY`       | `GROQ_BASE_URL`              |
| `openai`          | `OPENAI_API_KEY`     | `OPENAI_BASE_URL`            |
| `kimi`/`moonshot` | `KIMI_API_KEY`       | `KIMI_BASE_URL`              |
| `openrouter`      | `OPENROUTER_API_KEY` | `OPENROUTER_BASE_URL`        |
| `together`        | `TOGETHER_API_KEY`   | `TOGETHER_BASE_URL`          |
| `anthropic`       | `ANTHROPIC_API_KEY`  | — (no native adapter)        |
| `gemini`          | `GEMINI_API_KEY`     | use Google's compat endpoint |

Tiers: `AI_LOCAL_*` (triage), `AI_FAST_*` (form answers), `AI_SMART_*` (tailoring/reasoning). Each tier also accepts `AI_<TIER>_BASE_URL`.

### 6.3 Fallbacks between tiers

```dotenv
AI_LOCAL_FALLBACK=fast            # local fails → use the fast tier
AI_SMART_FALLBACK=groq:llama-3.3-70b-versatile   # explicit provider:model
AI_FALLBACK_ENABLED=false         # disables all fallbacks
```

### 6.4 Semantic embeddings (optional, Ollama)

```powershell
ollama pull nomic-embed-text
career config set AI_EMBEDDINGS_ENABLED true
career config set OLLAMA_EMBED_MODEL nomic-embed-text
```

Enables semantic `JOB_TITLES` matching and profile RAG in tailoring.

## 7. Execution mode and score thresholds

```dotenv
EXECUTION_MODE=HYBRID_THRESHOLD    # FULL_AUTO | SEMI_AUTO | HYBRID_THRESHOLD
FIT_MIN_SCORE=75                   # minimum to reach tailoring
FIT_AUTO_SCORE=88                  # ≥ this score → automatic send in hybrid mode
LEXICAL_MIN_TERMS=1                # Layer-0 lexical filter
JOB_TITLES="backend developer; fullstack developer; software engineer"
```

- `SEMI_AUTO` → every job goes to review (`review`) before any send.
- `HYBRID_THRESHOLD` → auto-sends only jobs reaching `FIT_AUTO_SCORE`; the rest queue up.
- `FULL_AUTO` → sends everything above the threshold.

## 8. Discovery

```dotenv
DISCOVERY_SOURCES=remoteok,remotive,linkedin    # empty = default enabled sources
DISCOVERY_EXCLUDE_SOURCES=programathor
DISCOVERY_REGIONS=BR,GLOBAL                     # BR,LATAM,PT,EU,US,GLOBAL,ASIA,OCEANIA
DISCOVERY_WORK_MODELS=REMOTE,HYBRID
DISCOVERY_MAX_JOBS_PER_SOURCE=20
DISCOVERY_MAX_JOBS_PER_RUN=100
DISCOVERY_MIN_JOBS_PER_RUN=0       # per-run send target (0 = off)
DISCOVERY_CONCURRENCY=4
DISCOVERY_USE_GENERIC_FALLBACK=true            # LLM extractor for pages without API
DISCOVERY_GENERIC_MODEL=                       # empty inherits AI_LOCAL_*
DISCOVERY_SEARCH_ENGINE=duckduckgo             # duckduckgo|bing|none
DISCOVERY_BROWSER_PROFILE_DIR=                 # session for render:true/LinkedIn sources
DISCOVERY_ATS_BOARDS=greenhouse:acme,lever:stripe
DISCOVERY_POSTS_OCR=true                        # OCR on LinkedIn post images
DISCOVERY_SCROLL_MAX=5                          # live-page scrolls on LinkedIn
```

Useful commands:

```powershell
career discover                          # search only — applies to nothing
career discover --export jobs.json       # export for later review
career discover --dry-run                # list active sources without fetching
career scan remoteok --max-jobs 3        # test a specific source
career run --jobs-file jobs.json         # process the exported batch
career run --dry-run                     # full funnel without sending anything
```

`discover` never writes to `jobs.sqlite`; `run` records jobs and review states.

## 9. E-mail (SMTP + vault + IMAP/OTP)

```dotenv
EMAIL_ENABLED=true
EMAIL_DISPATCH_MODE=HYBRID            # HYBRID | FULL_AUTO | REVIEW_ONLY
EMAIL_MAX_DAILY=45                    # max sends/day
EMAIL_MIN_SCORE_AUTO_SEND=88
EMAIL_SMTP_CREDENTIAL_REF=smtp-main
EMAIL_COOLDOWN_DAYS=30                # days before re-sending to a recipient
EMAIL_TEMPLATE_PATH=storage/email_template.md
EMAIL_INCLUDE_SALARY=true
```

**SMTP credential in the vault** (never in `.env`):

```powershell
career vault set smtp-main    # prompts host/port/user/pass; AES-256-GCM encrypted
career vault list
```

Gmail: use an "App Password". The vault lives at `<CAREER_HOME>/storage/credentials.vault.enc` — in portable mode it travels with the folder.

**E-mail OTP** (verification codes during logins):

```powershell
career vault set imap-main    # host/port/secure/user/pass of the IMAP mailbox
```

With a Gmail/Outlook `smtp-main`, the IMAP host is derived automatically. Portal logins in the vault: `career vault set login-gupy.io` (portal user+password) — autofill fills the signin itself; session cookies are stored as `session-<domain>`.

## 10. WhatsApp

```dotenv
WHATSAPP_ENABLED=true
WHATSAPP_MODE=MANUAL_QUEUE           # MANUAL_QUEUE | EVOLUTION_API
WHATSAPP_TEMPLATE_PATH=storage/whatsapp_template.md
WHATSAPP_COOLDOWN_DAYS=30
WHATSAPP_ATTACH_RESUME=true
```

- `MANUAL_QUEUE` (default): number + message + PDF queue up in `review`; confirm the send with `mark <url> whatsapp` or via the interactive review.
- `EVOLUTION_API`: real instance — set `EVOLUTION_API_URL` + `EVOLUTION_API_KEY` and run `career whatsapp setup` (creates the instance and shows QR/pairing in the terminal). `career whatsapp status` checks it.

## 11. Browser and autofill

```dotenv
AUTOFILL_HEADLESS=true                  # false = visible window
AUTOFILL_PROFILE_DIR=storage/browser_profile   # persistent profile (reuses logins)
AUTOFILL_STEALTH=true                   # anti-detection stealth plugin
AUTOFILL_HUMAN_PACE=true                # curved mouse + delayed typing
AUTOFILL_VISIBLE_ON_ESCALATION=true     # CAPTCHA/OTP/login reopens visible
AUTOFILL_AGENT_NAV=true                 # agent navigates to the form (never submits)
AUTOFILL_DEBUG_FILL=false               # logs field→value→source
AUTOFILL_QUESTION_SIMILARITY_THRESHOLD=0.9
AUTOFILL_DEFAULTS=authorized to work=yes;requires sponsorship=no
```

**Portal logins** (LinkedIn, Gupy, Glassdoor…):

```powershell
career login https://www.linkedin.com   # opens visible Chromium — log in
```

The session lives in the persistent profile and serves both discovery (`render: true`) and autofill — one login feeds both.

## 12. Master profile

```powershell
career import --pdf CV.pdf       # AI structuring → draft for review
career import --inbox            # processes storage/profile_inbox/
career approve                   # promotes draft → profile.master.md
```

Fine-grained paths (relative to `CAREER_HOME` or absolute): `PROFILE_INBOX_DIR`, `PROFILE_DRAFT_PATH`, `PROFILE_MASTER_PATH`, `PROFILE_COMPILED_PATH`, `PROFILE_HISTORY_DIR`, `JOBS_DB_PATH`.

## 13. Daily command routine

```powershell
career discover --export jobs.json   # search today, apply later
career run --jobs-file jobs.json     # process the batch
career review                        # NEEDS_HUMAN_INPUT + WhatsApp queue
career retry --send                  # retry web forms (sends at the end)
career mark <url|id> applied         # manual queue marking
career status                        # counts by status
career applied --limit 10            # what was already sent
career inspect <url>                 # diagnose a form without filling
```

## 14. Troubleshooting

| Symptom                                         | Likely cause                        | Fix                                                                              |
| ----------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------- |
| `playwright unavailable` / forms fall to review | `career-runtime/` missing           | `runtime setup` or use the full ZIP; confirm with `runtime status`               |
| Chromium won't open on Linux                    | missing system libs                 | see §2 (apt)                                                                     |
| macOS "cannot verify the developer"             | quarantine                          | `xattr -dr com.apple.quarantine .` on the folder                                 |
| SmartScreen/antivirus                           | unsigned binary/Chromium            | allow execution (§2)                                                             |
| PDF resume parses badly                         | scanned PDF (no text layer)         | re-export the resume with selectable text                                        |
| OCR won't run offline                           | `tessdata/` missing                 | full runtime or correct `CAREER_RUNTIME`                                         |
| `.env` ignored                                  | wrong folder                        | exe `.env` > cwd `.env` — `config path`/`config get` show the source             |
| `config init` fails                             | `~/.careerfacilator` not writable   | use `CAREER_HOME=.` in the exe `.env` (portable)                                 |
| Ollama "connection refused"                     | service stopped                     | `ollama serve` + `ollama pull <model>`                                           |
| Remote provider 401                             | API key                             | `config set <P>_API_KEY ...` + `config check`                                    |
| Moved folder and lost data                      | relative `CAREER_HOME` moved        | in the exe, `CAREER_HOME` anchors on the binary's folder — move the whole folder |
| `tar` not found in `runtime setup`              | very old Windows                    | download the full `.zip` instead                                                 |
| Old Node producing the exe                      | `node:sqlite` requires Node ≥ 22.13 | only affects builds from source; prebuilt binaries are fine                      |

## 15. Binary vs. source install differences

With `career-runtime/` present: **no functional difference**. Without it: web forms, authenticated render, `login`/`inspect`/`retry`, text-layer PDF and OCR degrade (message/review). What the binary never brings by itself: Ollama (separate install), the `skills/` library (copy from package/repo) and initial configuration (`config init` or `.env`).
