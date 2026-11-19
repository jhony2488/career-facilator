# 8. Dynamic Skills Module (`src/skills/`)

**Modular Injection of Competencies, Domain Rules and Application Strategies On Demand**

## 8.1. Overview and Context Optimization

Instead of maintaining a gigantic System Prompt with instructions for every type of job (Frontend, Backend, Mobile, AI, DevOps, Freelance, International/Remote), the Skills Module splits tactical knowledge into isolated, lightweight files (`SKILL.md` + `keywords.json`).

To save tokens:

- **Two-Stage Discovery (Progressive Disclosure):** During initial triage, the AI receives only the minimal manifest (`id`, `name`, `triggers`) of each skill (~15 tokens per skill).
- **Selective Loading:** Only after `triageAgent.ts` identifies the job's stack and type does the Skill Loader inject the full instructions of the 1 or 2 strictly necessary skills into `tailorerAgent.ts`.
- **Reusable and Creatable Skills:** The user can create new skills in Markdown or let the system automatically generate a new skill from interview feedback.

## 8.2. Module Directory Structure

```text
career-facilitator-ts/
└── src/
    └── skills/
        ├── core/
        │   ├── skillRegistry.ts     # Indexes available skills and extracts lightweight metadata
        │   ├── skillSelector.ts     # Selects which skills to activate (RegEx + Semantic score)
        │   └── skillInjector.ts     # Compiles active instructions into the prompt with cache
        └── library/
            ├── fullstack-ts/
            │   ├── SKILL.md         # Highlight rules for Next.js, React, Node, Prisma/SQL
            │   └── keywords.json    # ATS synonyms and suggested impact metrics
            ├── ai-engineer/
            │   ├── SKILL.md         # Focus on RAG, local LLMs, quantization, agents and Python/TS
            │   └── keywords.json
            ├── international-remote/
            │   ├── SKILL.md         # Adaptation for English-language jobs (B2B/Contractor, USD, timezone)
            │   └── keywords.json
            └── gupy-workday-ats/
                ├── SKILL.md         # Strict formatting rules for rigid ATS parsers
                └── keywords.json
```

## 8.3. Standard Skill Format (`SKILL.md`)

Each skill is declarative and readable by both humans and the LLM:

```markdown
---
id: fullstack-ts
name: Full-Stack TypeScript & SaaS Architect
triggers: [typescript, next.js, react, node, express, prisma, postgresql, full-stack, saas]
priority: 10
---

# Resume Tailoring Guidelines
- **Positioning:** Highlight end-to-end experience (relational database architecture to reactive UI).
- **Mandatory Metrics:** Prioritize deliveries with measurable impact (e.g.: latency reduction, automated deploys via Docker/CI, multi-tenant architecture).
- **Project Ordering:** Put complete SaaS projects with authentication, payments or analytical dashboards at the top.

# Rules for Essay Questions (Q&A)
- When answering about architecture, explicitly mention SOLID principles, end-to-end strict typing and automated tests.
- Keep answers direct, between 60 and 110 words.
```

## 8.4. Core TypeScript Implementation

### `src/skills/core/skillSelector.ts` (Deterministic Selection — Zero AI Cost)

Selects the relevant skills by crossing the `matchedKeywords` returned by triage with the skills' `triggers`, avoiding spending tokens on an extra router agent:

```typescript
import { SkillMetadata, LoadedSkill } from './skillRegistry';

export function selectRelevantSkills(
  matchedKeywords: string[],
  availableSkills: SkillMetadata[],
  maxSkills = 2
): SkillMetadata[] {
  const normalizedKeywords = matchedKeywords.map((k) => k.toLowerCase().trim());

  const scored = availableSkills
    .map((skill) => {
      const hits = skill.triggers.filter((trigger) =>
        normalizedKeywords.some((kw) => kw.includes(trigger) || trigger.includes(kw))
      ).length;

      return {
        skill,
        score: hits * 10 + skill.priority,
        hits,
      };
    })
    .filter((item) => item.hits > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, maxSkills).map((item) => item.skill);
}
```

### `src/skills/core/skillInjector.ts` (Optimized Prompt Injection)

Loads the `SKILL.md` body only for the selected skills and formats a compact block for `tailorerAgent.ts`:

```typescript
import fs from 'node:fs/promises';
import { SkillMetadata } from './skillRegistry';

export async function buildSkillsContextBlock(selectedSkills: SkillMetadata[]): Promise<string> {
  if (selectedSkills.length === 0) return '';

  const blocks = await Promise.all(
    selectedSkills.map(async (meta) => {
      const rawContent = await fs.readFile(meta.filePath, 'utf-8');
      // Removes the YAML frontmatter to avoid wasting tokens
      const cleanInstructions = rawContent.replace(/^---[\s\S]*?---\n/, '').trim();
      return `### SKILL ATIVA: ${meta.name}\n${cleanInstructions}`;
    })
  );

  return `\n<active_skills>\n${blocks.join('\n\n')}\n</active_skills>\n`;
}
```

## 8.5. Pipeline Flow Integration

In the `src/db/schema.ts` file, we add the `appliedSkills` column to the `applications` table to track which skills generated the highest response/interview rate:

1. `triageAgent.ts` extracts `matchedKeywords`: `["TypeScript", "Next.js", "PostgreSQL", "Remote USD"]`.
2. `skillSelector.ts` automatically activates `fullstack-ts` and `international-remote` (**0 tokens spent on selection**).
3. `skillInjector.ts` attaches only those two sets of guidelines to the `tailorerAgent.ts` prompt, generating a resume and answers perfectly calibrated for that specific job.
4. **Conversion Telemetry:** The database records which skill combinations resulted in scheduled interviews, allowing the rules in `src/skills/library/` to be continuously refined.

---

« [Previous: Flow and Safety](04-flow-and-safety.md) | [Index](README.md) | [Next: Discovery and Deduplication →](06-discovery-and-dedup.md)
