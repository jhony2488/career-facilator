# 6. Execution Flow and Safety (Human-in-the-Loop)

To avoid account blocks or submissions with inaccurate information, the pipeline follows a **strict state machine in SQLite**:

| Status | Description |
|--------|-------------|
| `DISCOVERED` | Job collected and deduplicated in the database. |
| `TRIAGED` | Evaluated by Layer 0 + Layer 1. If `fitScore < 75`, automatically marked as `SKIPPED`. |
| `TAILORED` | Customized PDF resume generated in the `storage/generated_resumes/` folder and form answers prepared. |
| `READY_TO_REVIEW` | Playwright opens the job tab, fills all fields, attaches the generated PDF and pauses before the final submit button. |
| `APPLIED` | After the user visually reviews in the browser (and resolves any CAPTCHAs) and confirms in the terminal/HUD, the status is updated and recorded in the history. |

---

« [Previous: AI Optimization](03-ai-optimization.md) | [Index](README.md) | [Next: Dynamic Skills →](05-dynamic-skills.md)
