# 9. Application Modes (FULL_AUTO vs. SEMI_AUTO) and Match Scale

To allow the system to apply 100% autonomously without firing resumes at mediocre jobs, we add the **Autonomy Decision Engine** (`src/core/autonomyEngine.ts`) governed by a strict Fit Score scale.

## 9.1. Configurable Automation Levels

- **FULL_AUTO (Full Autopilot):**
  - The system finds jobs, calculates the real match against the resume, generates the tailored PDF, fills the form and clicks the submit button by itself, recording everything in SQLite and notifying on the HUD/Terminal.
  - **Safety Lock:** In FULL_AUTO mode, the system requires a much higher Fit Score (default: ≥ 88%) and blocks automatic submission if the page requires solving a complex CAPTCHA or contains new questions with low AI confidence.
- **SEMI_AUTO (Review Before Submit):**
  - Does all the heavy lifting (search, triage, customized PDF and complete form filling), but pauses before the Submit button awaiting your visual approval.
- **HYBRID_THRESHOLD (Recommended):**
  - Jobs with a very high match (≥ 88%) are sent in FULL_AUTO immediately; good jobs (75% to 87%) go to the quick review queue (SEMI_AUTO).

## 9.2. How the System Ensures the Job Is Actually Good for You

Before authorizing an automatic application, `triageAgent.ts` cross-references `profile.master.json` (the master profile compiled from the approved MD — see [Profile Intake](13-profile-intake.md)) against the job description across **4 weighted axes**:

| Axis | Weight | Description |
|------|--------|-------------|
| **Core Technical Stack** | 40% | Requires a match on the core technologies of your resume (e.g.: TypeScript, Next.js, Node.js, PostgreSQL), penalizing jobs where your stack is only secondary. |
| **Seniority and Real Scope** | 25% | Validates required years of experience and responsibilities (avoids applying to internship/junior positions or incompatible executive roles). |
| **Project and Domain Alignment** | 20% | Uses local embeddings to check whether the systems you have already built (e.g.: SaaS, financial dashboards, AI automations) solve problems similar to the job's. |
| **Zero Dealbreakers** | 15% | Deterministic blocking of eliminatory restrictions (e.g.: "Must reside in US with Green Card" or a 100% on-site model outside your city). |

## 9.3. Review queue: process now, approve later

Nothing has to be decided during the `run` — the review modes exist precisely so you can approve applications **after** the heavy work is done:

- **`SEMI_AUTO` pauses everything.** The engine routes 100% of jobs to `REVIEW`, whatever the Fit Score. The system discovers, triages, generates the tailored resume and fills the form — but stops at `PAUSE_BEFORE_SUBMIT`: the job stays `READY_TO_REVIEW` in `jobs.sqlite` (or `NEEDS_HUMAN_INPUT` when the page requires a CAPTCHA, login or unknown field). Nothing is submitted on its own.
- **`HYBRID_THRESHOLD` (default) is already halfway there.** Only jobs with fit ≥ 88% (`minScoreForFullAuto`) go out by themselves; everything else lands in the same review queue. And a required-field answer coming only from the AI counts as low confidence — it forces review even under `FULL_AUTO`.
- **Review commands:** in the `career` shell (or directly: `career review`), `review` walks `READY_TO_REVIEW` + `NEEDS_HUMAN_INPUT` + the WhatsApp queue asking the outcome of each item; `retry --send <url|id>` re-fills and submits; `mark <url|id> <status>` records the manual outcome (`applied`, `skipped`, `rejected`…); `status` shows counts per state; `remove <url|id>` takes the job out of history so it can be reprocessed.

Typical "search now, review later" sequence: `career config set EXECUTION_MODE SEMI_AUTO` → `career run` → `career review` when you have time.

---

« [Previous: Discovery and Deduplication](06-discovery-and-dedup.md) | [Index](README.md) | [Next: Geographic Scope →](08-geographic-scope.md)
