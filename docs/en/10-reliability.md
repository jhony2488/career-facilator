# Reliability and Resilience Mechanisms

Five mechanisms that close the end-to-end cycle: Discovery → Geographic Filter → Deduplication → Optimized Triage → Skills → PDF Generation → Multi-Step Filling → Safe Escalation → Response Tracking.

## 1. Session, Authentication and Rate-Limit Management (`src/scraper/sessionVault.ts`)

**The problem:** Portals such as LinkedIn, Gupy and Workday require login (or create temporary accounts during the application) and block bots that make requests too quickly.

**What to add:**

- Encrypted persistence of cookies and Playwright `storageState` (vault = local AES-256-GCM file with a master password).
- **Jittered Queue (Random Delay):** Limit execution to at most 1 application every 3 to 8 minutes with random variation, simulating real human behavior.
- **Platform rate-limit (HTTP 429, speed challenge):** that source's queue pauses with exponential backoff; other sources keep processing normally.

## 2. Multi-Step Form (Wizards) and Shadow DOM Handling (`src/autofill/wizardNavigator.ts`)

**The problem:** Platforms such as Workday, Gupy and Taleo do not have a single "Submit" button — they split registration into 4 to 6 consecutive screens (Personal Data → Experience → Questions → Review) and use Shadow DOM or iframes.

**What to add:**

- A step navigation loop that fills the current screen, clicks "Next", waits for the DOM transition, validates that no red required-field error message has appeared and repeats until reaching the final review/submit screen.
- **Implemented:** inspection (`pageInspector.snapshotScript`) is multi-frame — it runs in every `page.frames()` (cross-origin iframes included) and recurses into **open** shadow roots, stamping `frameIdx` on each field so the executor acts in the right scope; Next/submit buttons are searched across all frames. Without an `input[type=file]`, detected dropzones receive the PDF via `dragenter/dragover/drop` events carrying a `DataTransfer` (`playwrightExecutor.dropResumeViaDropzone`). **Closed** shadow roots remain opaque by platform design.
- **Implemented:** a job page with no form fields → `pageInspector.followApplyLink` looks for an apply link/button ("Apply/Candidate-se/…" text, **a path ending in `/apply`, `/bewerben`, `/postul`…** or a link to a known ATS host), navigates **1 hop** and re-inspects the destination — the real ATS form is what gets filled. A page whose snapshot comes back empty waits for `networkidle` (4 s) and re-inspects, covering late-mounting widgets/iframes. With no reachable target, it falls back to the message channel/`NEEDS_HUMAN_INPUT` as before.

## 3. Blocker Detection and Human Escalation (`src/core/escalationHandler.ts`)

**The problem:** Even in FULL_AUTO mode, the system will encounter CAPTCHAs (Cloudflare Turnstile, reCAPTCHA), e-mail code verification (Workday account-creation 2FA) or essay questions not covered by the resume.

**What to add:**

- When the bot detects a CAPTCHA, e-mail OTP or unknown required field, it does not fail or invent data: it changes the job status to `NEEDS_HUMAN_INPUT`, saves the tab state and fires an alert on the HUD/notification so you can apply manually.
- **Human wait timeout:** if the blocker is not resolved within the configured deadline (`escalationTimeoutMinutes`), the tab is closed and the serialized state is kept for later resumption — the application stays in the pending list.
- **Per-platform circuit breaker:** after N escalations on the same platform in a day (`maxEscalationsPerPlatformPerDay`), that source is paused until the next day.

**Anti-bot prevention (`src/scraper/browserManager.ts` + `src/utils/humanSim.ts`):** fewer CAPTCHAs triggered instead of more solved — the system does **not** solve CAPTCHAs in code. Chromium launches via `playwright-extra` + `puppeteer-extra-plugin-stealth` (`AUTOFILL_STEALTH`, default on): no `navigator.webdriver` flag, no `HeadlessChrome` in the UA, coherent WebGL/languages/plugins and `--disable-blink-features=AutomationControlled`. Headless mode uses the full Chromium build (`channel: 'chromium'` — ~headed fingerprint, fallback to classic headless). The viewport is drawn from common desktop resolutions per session and cookies/logins persist in the profile (`AUTOFILL_PROFILE_DIR`). During interactions (`AUTOFILL_HUMAN_PACE`, default on) the executor moves the mouse in a jittered polyline before clicks and types character by character — short pauses between steps instead of instant teleports.

**Visible resolution (`AUTOFILL_VISIBLE_ON_ESCALATION`, default on):** when a CAPTCHA/OTP appears in headless mode, the form automatically reopens in a visible browser on the same profile — fields refilled, you only solve the challenge and submit. The job stays `NEEDS_HUMAN_INPUT` until you confirm (`mark <url> applied` or `e` in `review`); windows are left open at the end of the run. The same flow covers **login walls** — a page with an auth URL or a password field in a short form becomes `LOGIN_REQUIRED`: it reopens visibly, you sign in, Enter resumes and the fill is redone. **Vault autologin:** portals that demand credentials per subdomain (Gupy requires sign-in on every `<company>.gupy.io`, even with a `.gupy.io` session) store the credential encrypted via `vault set login-<domain>` (e.g., `login-gupy`) — `{user, pass}` — and the wall is filled and submitted on its own; without a credential, or if autologin fails, the manual flow (visible window + Enter) still applies. To authenticate outside a run, `career login <url|portal>` opens the profile browser (shortcuts: `gupy`, `linkedin`, `indeed`, `vagas`, `infojobs`, `catho`) — the session is saved and reused on the following runs.

## 4. Post-Application Tracker and Feedback Loop (`src/tracker/outcomeMonitor.ts`)

**The problem:** Sending 100 resumes is useless without knowing which resume version or which Skill is converting into interviews.

**What to add:**

- **Opt-in** inbox reading (IMAP/Gmail, read-only access) filtering only senders from applied companies to automatically update the status in SQLite (`APPLIED` → `REJECTED`, `ASSESSMENT_INVITED` or `INTERVIEW`). Recruiter replies in the same thread are out of scope — the system does not send e-mail replies.
- **Response classification:** deterministic heuristics first; a lightweight model only for ambiguous cases. Status only changes automatically with confidence ≥ 0.8 — below that, the message is flagged for user review.
- Conversion metric per Skill and Fit Score (e.g.: discovering that jobs where you activate the `ai-engineer` skill get 3x more responses than generic `fullstack-ts`).

## 5. Dry-Run Module (Safe Simulation)

**What to add:** A `--dry-run` flag in the CLI that runs the entire funnel (search, deduplication, Fit Score calculation, skill activation, tailored PDF generation and page field mapping), but **does not click Submit**, allowing you to calibrate the Fit Score scale (85% vs 88%) before turning on FULL_AUTO mode for the first time.

---

« [Previous: Configuration](09-configuration.md) | [Index](README.md) | [Next: Email Application →](11-email-application.md)
