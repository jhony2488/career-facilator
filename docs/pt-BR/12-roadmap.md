# 7. Próximos Passos para Implementação

1. **Setup Inicial:** Inicializar projeto Node/TypeScript com `node:sqlite` (builtin), `playwright` e `ai` (Vercel AI SDK).
2. **Construir o `domCleaner.ts` + `triageAgent.ts`:** Validar a extração e o cálculo de Fit Score com custo mínimo de tokens.
3. **Criar o Template ATS (`resumeBuilder.ts`):** Estruturar um layout HTML limpo em coluna única que gere PDFs leves e 100% legíveis por parsers de RH.
4. ~~Acoplar o Executor Playwright (`formExecutor.ts`)~~ **feito:** `pageInspector.ts` + `playwrightExecutor.ts` conectados — formulário web real via Chromium (`AUTOFILL_HEADLESS`/`AUTOFILL_PROFILE_DIR`), preenchimento SPA, multi-etapas e anel de aprovação.

### Ordem sugerida de evolução

| Fase | Entregas |
|------|----------|
| **Fase 0 — Perfil-Mestre** | `intakeCore.ts`, `pdfExtractor.ts`, `profileStructurer.ts`, `masterProfileStore.ts`, `profileCompiler.ts` (ver [Ingestão de Perfil](13-ingestao-de-perfil.md)) |
| **Fase 1 — Núcleo de Triagem** | `domCleaner.ts`, `triageAgent.ts`, `repository.ts` (deduplicação), `tokenTracker.ts` |
| **Fase 2 — Geração de Ativos** | `tailorerAgent.ts` com prompt caching, `resumeBuilder.ts`, templates ATS |
| **Fase 3 — Automação de Envio** | `formInspector.ts`, `deterministicMatcher.ts`, `wizardNavigator.ts`, `formExecutor.ts`, `sessionVault.ts` |
| **Fase 4 — Inteligência e Escala** | Módulo `src/skills/`, `src/geo/`, `autonomyEngine.ts`, `escalationHandler.ts`, `--dry-run` |
| **Fase 5 — Fechamento do Ciclo** | `email_application/`, `outcomeMonitor.ts`, métricas de conversão por skill |
| **Fase 6 — Discovery expandido** | `src/discovery/` com APIs/RSS públicas + fallback genérico HTML+LLM (`genericExtractor.ts`); pendente: adapters ATS por slug, LinkedIn autenticado, dorks orgânicos |
| **Fase 7 — Distribuição executável** | Binário SEA single-file Win/macOS (arm64+x64)/Linux + runtime sidecar `career-runtime/` (playwright, browsers, pdf-parse, tesseract, skills) — paridade total com a instalação por código (ver `feature/16`). Release publica só o **instalador desktop** `career-ui-*` (app + CLI embutido, modelo git+git-gui — o zip do CLI é insumo intermediário do sidecar); `career runtime status` diagnostica |

---

« [Anterior: Candidatura por E-mail](11-candidatura-por-email.md) | [Índice](README.md) | [Próximo: Ingestão de Perfil →](13-ingestao-de-perfil.md)
