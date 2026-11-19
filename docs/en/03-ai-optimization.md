# 5. AI Usage Optimization Strategies (Core)

## 5.1. Aggressive Context Cleaning (`domCleaner.ts`)

Before any AI call, the job's HTML goes through a sanitization pipeline that removes `<script>`, `<style>`, `<svg>` tags, menus and footers, converting only the main description container into compact Markdown. This reduces an average page from **18,000 tokens to ~900 tokens**.

## 5.2. Strict Schemas with Zod (`triageAgent.ts`)

Avoids long, conversational LLM responses during the analysis step, forcing a minimal JSON:

```typescript
import { z } from 'zod';

export const JobTriageSchema = z.object({
  fitScore: z.number().min(0).max(100).describe('Aderência técnica e de senioridade de 0 a 100'),
  isDealbreaker: z.boolean().describe('True se exigir idioma, localização ou stack impossível'),
  missingSkills: z.array(z.string()).max(5),
  matchedKeywords: z.array(z.string()).max(10),
  atsTitleSuggestion: z.string().describe('Título profissional ideal para o topo do currículo'),
});

export type JobTriageResult = z.infer<typeof JobTriageSchema>;
```

Provider fallback: triage tries the local model first and uses the cloud as a backup; if **all** providers fail, the job goes to `NEEDS_HUMAN_INPUT` — it is never approved for lack of evaluation.

## 5.3. Prompt Caching for the Master Resume (`tailorerAgent.ts`)

The `profile.master.json` — an artifact compiled from the user-approved `profile.master.md` (see [Profile Intake](13-profile-intake.md)), containing the entire professional history, projects, metrics and behavioral answers — is sent as a system block with **Ephemeral Cache / Prefix Caching**. When processing 30 jobs in a batch, the system pays for processing the full profile only on the first job, getting a **75% to 90% discount on input tokens** for the following 29 jobs.

## 5.4. Hybrid Filling (`deterministicMatcher.ts`)

Common application form fields (Name, E-mail, Phone, LinkedIn, GitHub, Portfolio, Salary Expectation, Availability) are resolved locally via a TypeScript synonym dictionary (**0 AI calls**). The LLM is only invoked when the inspector detects a `<textarea>` with a new essay question (e.g.: "Tell us about a complex technical challenge you solved").

---

« [Previous: Architecture](02-architecture.md) | [Index](README.md) | [Next: Flow and Safety →](04-flow-and-safety.md)
