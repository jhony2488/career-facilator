# 7. Next Implementation Steps

1. **Initial Setup:** Initialize a Node/TypeScript project with `drizzle-orm`, `better-sqlite3`, `playwright` and `ai` (Vercel AI SDK).
2. **Build `domCleaner.ts` + `triageAgent.ts`:** Validate extraction and Fit Score calculation with minimal token cost.
3. **Create the ATS Template (`resumeBuilder.ts`):** Structure a clean single-column HTML layout that generates lightweight PDFs 100% readable by HR parsers.
4. **Attach the Playwright Executor (`formExecutor.ts`):** Integrate React/SPA-compatible filling and the manual approval loop.

### Suggested evolution order

| Phase | Deliverables |
|-------|--------------|
| **Phase 0 — Master Profile** | `intakeCore.ts`, `pdfExtractor.ts`, `profileStructurer.ts`, `masterProfileStore.ts`, `profileCompiler.ts` (see [Profile Intake](13-profile-intake.md)) |
| **Phase 1 — Triage Core** | `domCleaner.ts`, `triageAgent.ts`, `repository.ts` (deduplication), `tokenTracker.ts` |
| **Phase 2 — Asset Generation** | `tailorerAgent.ts` with prompt caching, `resumeBuilder.ts`, ATS templates |
| **Phase 3 — Submission Automation** | `formInspector.ts`, `deterministicMatcher.ts`, `wizardNavigator.ts`, `formExecutor.ts`, `sessionVault.ts` |
| **Phase 4 — Intelligence and Scale** | `src/skills/` module, `src/geo/`, `autonomyEngine.ts`, `escalationHandler.ts`, `--dry-run` |
| **Phase 5 — Cycle Closing** | `email_application/`, `outcomeMonitor.ts`, conversion metrics per skill |

---

« [Previous: Email Application](11-email-application.md) | [Index](README.md) | [Next: Profile Intake →](13-profile-intake.md)
