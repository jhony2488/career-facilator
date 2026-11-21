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

- **Public JSON APIs (enabled):** `remoteok`, `remotive`, `jobicy`, `arbeitnow`, `workingnomads`, `himalayas`, plus `weworkremotely` (RSS). They run through `src/discovery/adapters/apiAdapter.ts`/`rssAdapter.ts` and produce `RawJobInput` (`{url, html}`) for the pipeline. **Discovery is free; applying** depends on the source — `weworkremotely`, for instance, now requires a job-seeker account (paid Pro for most listings) to submit through the portal.
- **Source registry:** `src/discovery/registry.ts` records 100+ sources/ATS/job boards; `getActiveSources` in `src/discovery/sourceRegistry.ts` applies `DISCOVERY_*` env filters (allowlist, exclusion, regions, work models, risky/auth).
- **CLI:** `career run` (no `--jobs-file`) executes discovery; `career discover [--sources id1,id2] [--max-jobs N] [--export out.json]` lists or exports jobs; `career scan <source-id> [--max-jobs N]` tests one source. `--dry-run` on `discover` lists active sources without fetching.
- **Error isolation:** a failing source returns a `DiscoveryError` and the engine continues with the others; if all fail it alerts and stops without touching the AI tiers.
- **Limits/rate:** `DISCOVERY_MAX_JOBS_PER_SOURCE`, `DISCOVERY_CONCURRENCY`, `DISCOVERY_PER_DOMAIN_DELAY_MS`, `MAX_JOBS_PER_RUN` (global).
- **Generic fallback (HTML + LLM):** `html` sources with `url`/`searchUrlTemplate` use `src/discovery/adapters/htmlAdapter.ts` + `genericExtractor.ts` — the page becomes Markdown (`cleanJobHtml`) and a model extracts `{"jobs": [...]}` via `generateStructured`. Requires `DISCOVERY_USE_GENERIC_FALLBACK=true`; the model is `DISCOVERY_GENERIC_MODEL` or, when empty, inherits the `AI_LOCAL_*` tier (ollama provider only for now). Anti-fabrication holds: the prompt requires real URLs and leaves missing fields empty.
- **Organic search (dorks):** `search` sources run `src/discovery/adapters/searchAdapter.ts` — `DISCOVERY_SEARCH_ENGINE` = `duckduckgo` | `bing` (the other becomes a per-query fallback when the primary fails, e.g. DDG 202). Each source carries `adapterConfig.dorkTemplates` (`{query}` → terms from `JOB_TITLES`) or falls back to `dorkBuilder.ts`'s scope-driven plan. `site:` dorks filter hits by the real domain — engines sometimes relax the operator. `adapterConfig.titleFilter: false` disables the title filter (LinkedIn posts don't carry job titles). Sources: `searchdork` (scope plan — ATS + aggregators), `linkedin-posts` and `linkedin-jobs` (public LinkedIn site:dorks, no session).
- **Not implemented yet:** ATS company boards (Greenhouse/Lever/Gupy slugs) and LinkedIn with an authenticated session are registered but return a `not implemented` error until adapters are added.

---

« [Previous: Dynamic Skills](05-dynamic-skills.md) | [Index](README.md) | [Next: Application Modes →](07-application-modes.md)
