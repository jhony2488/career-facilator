# 9. Application Modes (FULL_AUTO vs. SEMI_AUTO) and Match Scale

To allow the system to apply 100% autonomously without firing resumes at mediocre jobs, we add the **Autonomy Decision Engine** (`src/core/autonomyEngine.ts`) governed by a strict Fit Score scale.

## 9.1. Configurable Automation Levels

- **FULL_AUTO (Full Autopilot):**
  - The system finds jobs, calculates the real match against the resume, generates the tailored PDF, fills the form and clicks the submit button by itself, recording everything in SQLite and notifying on the HUD/Terminal.
  - **Safety Lock:** In FULL_AUTO mode, the system requires a much higher Fit Score (e.g.: ≥ 85%) and blocks automatic submission if the page requires solving a complex CAPTCHA or contains new questions with low AI confidence.
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

---

« [Previous: Discovery and Deduplication](06-discovery-and-dedup.md) | [Index](README.md) | [Next: Geographic Scope →](08-geographic-scope.md)
