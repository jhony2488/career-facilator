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

## 5.5. Optimizations for small local models (3B)

The system supports small local models (e.g. `hermes3:latest` via Ollama) with three combined optimizations:

**Pre-triage lexical filter (`lexicalMatch.ts`)** — before any Layer 1 call, `computeLexicalFit` counts how many profile terms (stack + titles) appear in the job text. Below `LEXICAL_MIN_TERMS` (default 1) the job is discarded as `LOW_LEXICAL_FIT` — **zero inference spent** on jobs with no overlap.

**Profile RAG (`rag/profileRetriever.ts`)** — the tailor no longer receives the entire profile as a JSON dump (~2–4k tokens). `chunkProfile` splits it into labeled chunks (experiences, projects, stack, standard answers) and `retrieveRelevant` returns only the ones relevant to the job via BM25-like ranking + always-included skeleton. `retrieveHybrid` merges the lexical ranking with Ollama embeddings (`AI_EMBEDDINGS_ENABLED` + `nomic-embed-text`) via Reciprocal Rank Fusion — lexical remains the zero-cost default.

**Streaming + guaranteed JSON (`ollamaClient.ts`, `jsonRepair.ts`)** — the real client calls `/api/chat` with `format:'json'` (forced structured output, critical for 3B), `keep_alive` (warm model), env-driven `options`, and **NDJSON streaming** with `onToken` — the CLI shows progress in real time (`--verbose`). When the model wraps JSON in prose, `generateStructured` extracts the balanced object and retries once with the validation error.

**Two-layer title matching (`titleMatcher.ts`)** — compares the job title against `JOB_TITLES` before triage. The **deterministic** layer (zero cost, always on) handles common spelling variations: normalization (accent/punctuation/case), *squashed* substring ("Fullstack" ↔ "Full Stack"), PT↔EN aliases (`dev`/`developer`/`desenvolvedor`/`engineer`/`engenheiro` → canonical token), *containment* of distinctive tokens (generic ones like `dev`/`senior` don't count — "Backend" ≠ "Frontend"), and proportional Levenshtein for typos (disabled for titles under 6 chars). When nothing matches, the **probabilistic** layer — with `AI_EMBEDDINGS_ENABLED` — computes cosine similarity between embeddings (`nomic-embed-text`): "JS Developer" or "Programador React" match "Node.js Developer"/"Desenvolvedor Front End" with no manual rules. Target vectors are cached per run (N jobs = N+1 embeds); a strong deterministic match never calls the embedder; embedder failure silently degrades to deterministic.

---

« [Previous: Architecture](02-architecture.md) | [Index](README.md) | [Next: Flow and Safety →](04-flow-and-safety.md)
