# Testes — CareerFacilator AI

Suites Jest + ts-jest derivadas das especificações em `docs/pt-BR/` e `feature/*.feature`.

> **Status:** os testes importam de `../src/`, que ainda não existe — eles **não compilam/rodam** até a implementação começar. Isso é intencional (TDD/red-first): os testes são a spec executável dos módulos.

## Estrutura

```text
__tests__/
├── helpers/
│   ├── contracts.ts    # Tipos de domínio + assinaturas esperadas de src/ (FONTE DA VERDADE)
│   ├── factories.ts    # Builders: makeJob, makeMasterProfile, makeTriageResult, makeConfig...
│   ├── mocks.ts        # Mocks de deps externas: LLM, page state, SMTP, vault, repo
│   └── fixtures.ts     # HTML de vaga, SKILL.md, textos bloqueantes de exemplo
├── unit/               # Lógica pura e limites de decisão (17 suites)
├── integration/        # Pipelines com deps externas mockadas (7 suites)
└── e2e/                # Fluxo completo ponta a ponta com tudo mockado (3 suites)
```

## Convenções

- **Rastreabilidade:** cada `it()` referencia o cenário de origem com `// feature/NN: <nome>` quando mapeia 1:1 um cenário Gherkin.
- **Imports:** tipos vêm de `../helpers/contracts`; funções testadas vêm de `../src/...` (caminho espelhando `src/`).
- **Sem deps externas nos testes:** nunca importar `playwright`, `nodemailer`, SDKs de LLM — usar os mocks de `helpers/mocks.ts`.
- **Determinismo:** testes que envolvem IA injetam `mockTriageModel`/`mockTailorModel` — nunca dependem de modelo real.
- **Config:** usar `makeConfig()` com overrides — nunca hardcodar thresholds fora dos cenários que os testam explicitamente.

## Contratos provisórios

As assinaturas esperadas de cada módulo `src/` estão documentadas em [`helpers/contracts.ts`](helpers/contracts.ts). Se a implementação divergir, discutir/atualizar lá **antes** de alterar testes em massa.

## Comandos (quando `src/` existir e `npm install` tiver sido rodado)

```powershell
npm run test:unit          # só unit/
npm run test:integration   # só integration/
npm run test:e2e           # só e2e/
npm test                   # tudo
```

## Mapa feature → suites

| Feature | Unit | Integration | E2E |
|---------|------|-------------|-----|
| 01-discovery | `geo/dorkBuilder` | — | `pipeline.happy-path` |
| 02-deduplicacao | — | `repository.sqlite` | `pipeline.*` |
| 03-triagem-fit-score | `ai/triageAgent`, `ai/router` | `triage-to-tailor` | `pipeline.*` |
| 04-skills | `skills/skillSelector`, `skills/skillInjector` | `triage-to-tailor` | `pipeline.*` |
| 05-geracao-curriculo | `ai/tokenTracker` | `triage-to-tailor` | `pipeline.*` |
| 06-autofill | `autofill/deterministicMatcher` | `autofill-pipeline`, `wizard-flow` | `pipeline.*` |
| 07-modos | `core/autonomyEngine` | — | `pipeline.full-auto` |
| 08-escopo-geo | `geo/eligibilityGuard`, `geo/localeAdapter` | — | — |
| 09-escalonamento | — | `escalation` | `pipeline.full-auto` |
| 10-email | `email/recipientResolver` | `email-application` | — |
| 11-sessao | — | `escalation` (sessão expirada) | — |
| 12-tracking/dry-run | `tracker/outcomeMonitor` | — | `pipeline.dry-run` |
| 13-ingestao-perfil | `intake/pdfExtractor`, `intake/profileStructurer`, `intake/masterProfileStore`, `intake/profileCompiler` | `intake-pipeline` | — |
