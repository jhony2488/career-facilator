# Discovery Engine and Deduplication

The system operates in both discovery modes combined (rather than just throwing random terms into Google) so it neither misses jobs nor wastes processing.

## 1. How job search and extraction works (Discovery Engine)

- **Direct Scanning of Portals and Hidden APIs (Preferred — Faster and Cleaner):** Platforms like Greenhouse, Lever, Ashby, Workable and Gupy have public JSON endpoints or standardized per-company HTML structures. The scraper directly queries registered URLs or filtered searches on these portals (e.g.: `boards.greenhouse.io/company`), extracting the job without navigating through pages full of ads.
- **Search via Google Dorks / Search Engines (Open Discovery):** To find new companies that are not on your fixed list, the system runs structured searches (e.g.: `site:jobs.lever.co "TypeScript" "Remote"` or `site:boards.greenhouse.io "Full Stack"`) using search APIs (such as Serper/Brave Search) or Playwright, collecting only direct links to open jobs and ignoring blogs or spam aggregators.
- **LinkedIn / Aggregators (With Persistent Session):** Uses a persistent Playwright profile (already authenticated) to scan saved alerts with strict filters (e.g.: Last 24h, Remote), extracting only the job card.

## 2. How it avoids applying twice (3-Level Deduplication)

Before spending a single AI token, the repository (`src/db/repository.ts`) blocks duplicate jobs using three verification layers in SQLite:

1. **Canonical URL Blocking (Exact Match):** Strips tracking parameters from the URL (such as `?utm_source=...&ref=...`) and checks whether the base link already exists in the `jobs` table. If it does, it discards it in 0ms.
2. **Content Hash Blocking (Cross-Platform Deduplication):** Many companies post the same job on LinkedIn, Greenhouse and Gupy at the same time. The system generates a SHA-256 hash combining `normalized_company + normalized_title + first_300_characters`. If you already applied on LinkedIn, it automatically ignores the copy on Gupy.
3. **Per-Company Cooldown (Business Rule):** Checks the history to see whether you have already applied to that same company in the last X days (e.g.: 30 days), avoiding firing multiple resumes at the same recruiter in the same month.

## 3. How the Full Application Cycle works

```text
[ Direct Search (ATS) + Google Dorks ]
                │
                ▼
[ SQLite check: URL or Hash already exists? ] ──(YES)──► [ Discard (0 tokens) ]
                │ (NO - New Job)
                ▼
[ AI Triage (Fit Score >= 75%) + Skill Activation ]
                │
                ▼
[ Generates Tailored PDF Resume + Fills Form ]
                │
                ▼
[ Pause for Review (Human-in-the-Loop) -> Submit -> Records "APPLIED" status ]
```

- **History Recording:** As soon as the application is sent (or skipped due to low Fit Score), SQLite records the date, URL, hash, exact version of the submitted PDF, activated skills and status (`APPLIED`, `SKIPPED`, `INTERVIEW`, `REJECTED`).
- **Visual Detection on the Page:** In addition to the local database, if the scraper opens a job on LinkedIn or Gupy and detects native platform elements such as "application submitted 2 days ago", it automatically syncs the status to `APPLIED` in the database and aborts the flow.

## 4. Implemented sources and commands

- **Public JSON APIs (enabled):** `remoteok`, `remotive`, `jobicy`, `arbeitnow`, `workingnomads`, `himalayas`, `hnhiring` (Hacker News "Who is hiring" — the monthly Algolia API thread becomes one job per comment, with direct contact in the body → real e-mail channel) and `hnjobs` (official YC jobstories via the Firebase API — `it.url` is already the external apply link), plus `weworkremotely` and `euremotejobs` (RSS). They run through `src/discovery/adapters/apiAdapter.ts`/`rssAdapter.ts` and produce `RawJobInput` (`{url, html}`) for the pipeline. **Discovery is free; applying** depends on the source — `weworkremotely`, for instance, now requires a job-seeker account (paid Pro for most listings) to submit through the portal.
- **GitHub Issues (BR job boards):** `ghfrontendbr`, `ghbackendbr`, `ghreactbr` — open issues from `frontendbr/vagas`, `backend-br/vagas` and `react-brasil/vagas` via the GitHub REST API (1 request per repo, no token). Issue labels map to `workModel`/`contractType` and enrich seniority matching; the body carries the apply e-mail/link.
- **Config-derived search:** adapters build API queries from what is already configured — `jobicy` sends `count` (= per-source cap) and `geo` (first mappable `DISCOVERY_REGIONS` region: BR→brazil, US→usa, PT→portugal); `arbeitnow` paginates `?page=1..5` until the cap fills; APIs without parameters (`remoteok`) keep local title filtering. When an API exposes a distinct **apply** URL (RemoteOK `apply_url`, Himalayas `applicationLink`, HN `it.url`), that is what the pipeline loads — landing straight on the ATS form; listing pages with an "Apply" button are covered by `followApplyLink`.
- **HTML sources enabled by default:** `trampos`, `programathor`, `getonbrd` — they need `DISCOVERY_USE_GENERIC_FALLBACK=true`; without it they fail with a warning and don't break the cycle. Sources with `{query}` in `searchUrlTemplate` run one listing page per target title (cap 3 — each page costs one LLM extraction).
- **Source registry:** `src/discovery/registry.ts` records 100+ sources/ATS/job boards; `getActiveSources` in `src/discovery/sourceRegistry.ts` applies `DISCOVERY_*` env filters (allowlist, exclusion, regions, work models, risky/auth).
- **CLI:** `career run` (no `--jobs-file`) executes discovery; `career discover [--sources id1,id2] [--max-jobs N] [--export out.json]` lists or exports jobs; `career scan <source-id> [--max-jobs N]` tests one source. `--dry-run` on `discover` lists active sources without fetching.
- **Error isolation:** a failing source returns a `DiscoveryError` and the engine continues with the others; if all fail it alerts and stops without touching the AI tiers.
- **Limits/rate:** `DISCOVERY_MAX_JOBS_PER_SOURCE` (per source), `DISCOVERY_MAX_JOBS_PER_RUN` (global), `DISCOVERY_MIN_JOBS_PER_RUN` (sent-application target — below it the run expands collection), `DISCOVERY_CONCURRENCY`, `DISCOVERY_PER_DOMAIN_DELAY_MS`.
- **Generic fallback (HTML + LLM):** `html` sources with `url`/`searchUrlTemplate` use `src/discovery/adapters/htmlAdapter.ts` + `genericExtractor.ts` — the page becomes Markdown (`cleanJobHtml`) and a model extracts `{"jobs": [...]}` via `generateStructured`. Requires `DISCOVERY_USE_GENERIC_FALLBACK=true`; the model is `DISCOVERY_GENERIC_MODEL` or, when empty, inherits the `AI_LOCAL_*` tier (ollama provider only for now). Anti-fabrication holds: the prompt requires real URLs and leaves missing fields empty.
- **Organic search (dorks):** `search` sources run `src/discovery/adapters/searchAdapter.ts` — `DISCOVERY_SEARCH_ENGINE` = `duckduckgo` | `bing` (the other becomes a per-query fallback when the primary fails, e.g. DDG 202). Each source carries `adapterConfig.dorkTemplates` (`{query}` → terms from `JOB_TITLES`) or falls back to `dorkBuilder.ts`'s scope-driven plan. `site:` dorks filter hits by the real domain — engines sometimes relax the operator. `adapterConfig.titleFilter: false` disables the title filter (LinkedIn posts don't carry job titles). Sources: `searchdork` (scope plan — ATS + aggregators), `linkedin-posts` and `linkedin-jobs` (public LinkedIn site:dorks, no session).
- **ATS boards (`greenhouse`, `lever`):** jobs from specific companies via the board's public API — configure `DISCOVERY_ATS_BOARDS=greenhouse:acme,lever:stripe` (slug = the one in `boards.greenhouse.io/<slug>` or `jobs.lever.co/<slug>`) and enable the source in `DISCOVERY_SOURCES`. Other ATS providers (workday, icims…) remain stubs.
- **LinkedIn (`linkedin`, `linkedin-br`):** requires a session — run `career login linkedin` first. Two passes per target title: **jobs** (`/jobs/search`, `f_TPR=r86400` + `geoId`/`f_WT` from `DISCOVERY_REGIONS`/`DISCOVERY_WORK_MODELS` — without `geoId` the logged-in session applies the profile's saved location; description via `/jobs/view/<id>` render) and **posts** (`/search/results/content/`, up to 10/title, "talks about a job" gate). Navigation is interactive (`renderPage`): feed scrolling (`DISCOVERY_SCROLL_MAX`, default 5) + clicking "see more" to expand truncated posts/descriptions before capture. From a post, e-mail, external link and WhatsApp are read from the text; with no contact in the text, **OCR** (`tesseract.js` por+eng, `DISCOVERY_POSTS_OCR`, ≤3 images) reads the image binaries looking for contact info. An external apply link becomes the job's url; URL shorteners (`lnkd.in`, `bit.ly`…) are followed in the logged-in browser and the final URL becomes the apply url (a resolved LinkedIn listing is discarded); a post with no channel at all is still collected and lands `NEEDS_HUMAN_INPUT` in the review queue. Authwall → actionable error, without breaking the cycle.
- **Gupy:** uses the portal's public API (`portal.gupy.io/api/job-search/jobs` — the same one the SPA consumes; `limit/offset` pagination + per-target-title `jobName`), no browser and no auth. The `render: true` infrastructure (persistent Chromium reusing `AUTOFILL_PROFILE_DIR`/`DISCOVERY_BROWSER_PROFILE_DIR`) remains available for API-less SPA sources — none currently uses it. Login (`career login <url>`) matters at **apply** time: the application form lives on `<company>.gupy.io`.
- **Not implemented yet:** other ATS providers by company slug (workday, icims…) remain registered as stubs until adapters exist.

## 5. Search now, process/review later

Discovery is a stage independent of the funnel — you can separate "finding jobs" from "processing/applying" in three flows:

- **`discover` — pure search, no AI and no database.** It only runs `discoverJobs` and lists the URLs in the terminal (or saves them with `--export`): it spends no tokens and **writes nothing** to `jobs.sqlite` — the listed jobs do not show up in `status`/`review`. Use it to check what the sources return or to generate input for a later run.
- **`discover --export` → `run --jobs-file` — search today, process later.** `--export jobs.json` writes the batch in the format the pipeline consumes (`[{url, html}]`); `career run --jobs-file jobs.json` skips discovery and runs triage → tailoring → application over that batch only — no re-searching and no mixing in new jobs.
- **`run` under `SEMI_AUTO` — processes everything, sends nothing.** In a normal run every processed job is already recorded as `DISCOVERED` in SQLite; with `EXECUTION_MODE=SEMI_AUTO` the autonomy engine routes all of them to `REVIEW`, so the form is filled up to `PAUSE_BEFORE_SUBMIT` and the job waits in the queue (`READY_TO_REVIEW`/`NEEDS_HUMAN_INPUT`) for you to review later — details in [Application Modes](07-application-modes.md) §9.3. Meanwhile `run --dry-run` runs triage and tailoring without opening any form and without writing to the database, marking each job `DRY_RUN` with the route it would take.

---

« [Previous: Dynamic Skills](05-dynamic-skills.md) | [Index](README.md) | [Next: Application Modes →](07-application-modes.md)
