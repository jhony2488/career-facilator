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

---

« [Previous: Dynamic Skills](05-dynamic-skills.md) | [Index](README.md) | [Next: Application Modes →](07-application-modes.md)
