# 7. Next Implementation Steps

1. **Initial Setup:** Initialize a Node/TypeScript project with `node:sqlite` (builtin), `playwright` and `ai` (Vercel AI SDK).
2. **Build `domCleaner.ts` + `triageAgent.ts`:** Validate extraction and Fit Score calculation with minimal token cost.
3. **Create the ATS Template (`resumeBuilder.ts`):** Structure a clean single-column HTML layout that generates lightweight PDFs 100% readable by HR parsers.
4. ~~Attach the Playwright Executor (`formExecutor.ts`)~~ **done:** `pageInspector.ts` + `playwrightExecutor.ts` wired — real web forms via Chromium (`AUTOFILL_HEADLESS`/`AUTOFILL_PROFILE_DIR`), SPA fill, multi-step wizards, approval loop.

### Suggested evolution order

| Phase | Deliverables |
|-------|--------------|
| **Phase 0 — Master Profile** | `intakeCore.ts`, `pdfExtractor.ts`, `profileStructurer.ts`, `masterProfileStore.ts`, `profileCompiler.ts` (see [Profile Intake](13-profile-intake.md)) |
| **Phase 1 — Triage Core** | `domCleaner.ts`, `triageAgent.ts`, `repository.ts` (deduplication), `tokenTracker.ts` |
| **Phase 2 — Asset Generation** | `tailorerAgent.ts` with prompt caching, `resumeBuilder.ts`, ATS templates |
| **Phase 3 — Submission Automation** | `formInspector.ts`, `deterministicMatcher.ts`, `wizardNavigator.ts`, `formExecutor.ts`, `sessionVault.ts` |
| **Phase 4 — Intelligence and Scale** | `src/skills/` module, `src/geo/`, `autonomyEngine.ts`, `escalationHandler.ts`, `--dry-run` |
| **Phase 5 — Cycle Closing** | `email_application/`, `outcomeMonitor.ts`, conversion metrics per skill |
| **Phase 6 — Expanded discovery** | `src/discovery/` with public APIs/RSS + generic HTML+LLM fallback (`genericExtractor.ts`); pending: ATS slug adapters, authenticated LinkedIn, organic dorks |
| **Phase 7 — Executable distribution** | Single-file SEA binary for Win/macOS (arm64+x64)/Linux + `career-runtime/` sidecar (playwright, browsers, pdf-parse, tesseract, skills) — full parity with source installs (see `feature/16`); `career runtime setup|status` prepares/diagnoses |

---

« [Previous: Email Application](11-email-application.md) | [Index](README.md) | [Next: Profile Intake →](13-profile-intake.md)
