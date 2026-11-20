# CareerFacilator AI — Documentation (EN)

**Autonomous System for Prospecting, Semantic Triage, Resume Tailoring and Assisted Application with Inference Optimization**

Versão em português disponível em [`../pt-BR/`](../pt-BR/README.md).

## Index

| # | Document | Content |
|---|----------|---------|
| 01 | [Overview](01-overview.md) | System philosophy and the 3-layer Inference Optimization Funnel |
| 02 | [Architecture](02-architecture.md) | Pipeline diagram, tech stack and directory structure |
| 03 | [AI Optimization](03-ai-optimization.md) | DOM cleaning, Zod schemas, prompt caching and hybrid filling |
| 04 | [Flow and Safety](04-flow-and-safety.md) | State machine in SQLite and Human-in-the-Loop |
| 05 | [Dynamic Skills](05-dynamic-skills.md) | `src/skills/` module: registry, selector, injector and SKILL.md format |
| 06 | [Discovery and Deduplication](06-discovery-and-dedup.md) | Job sources (APIs/RSS/LLM fallback), registry and 3-level deduplication |
| 07 | [Application Modes](07-application-modes.md) | FULL_AUTO, SEMI_AUTO, HYBRID_THRESHOLD and the Fit Score scale |
| 08 | [Geographic Scope](08-geographic-scope.md) | `src/geo/` module: national, international or hybrid market |
| 09 | [Configuration](09-configuration.md) | Complete `careerOps.config.ts` and updated execution flow |
| 10 | [Reliability](10-reliability.md) | Sessions, multi-step wizards, human escalation, tracking and dry-run |
| 11 | [Email Application](11-email-application.md) | Resume submission fallback via SMTP/API for jobs without a form |
| 12 | [Roadmap](12-roadmap.md) | Next implementation steps |
| 13 | [Profile Intake](13-profile-intake.md) | `src/intake/` module: PDF → Markdown master profile with human review |
| 14 | [SMTP Setup — Gmail/Outlook](14-smtp-gmail-outlook-setup.md) | App password guide, credential vault and the 45 e-mails/day cap |
| 15 | [WhatsApp Application](15-whatsapp-application.md) | Manual queue or Evolution API with template text + resume PDF |
| 16 | [Tutorials](../../tutorials/en/README.md) | Step-by-step install guides (repo, npm global, release binaries) and AI model configuration |
