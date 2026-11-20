# CareerFacilator AI (TypeScript Edition)

Sistema autônomo de prospecção, triagem semântica, adaptação de currículos e candidatura assistida com otimização de inferência.

> **Status:** especificação completa + implementação inicial — todos os módulos do `src/` implementados e **28 suites Jest verdes**. Integrações de produção (clientes LLM, Playwright, SMTP) seguem injetáveis e ainda não conectadas (ver [Limitações atuais](#limitações-atuais)).

## O que é

O CareerFacilator AI automatiza o ciclo ponta a ponta de busca e candidatura a vagas (LinkedIn, Greenhouse, Lever, Gupy, Workday e portais próprios) operando sob um **Funil de Otimização de Inferência em 3 Camadas**:

| Camada | Função | Custo |
|--------|--------|-------|
| **0 — Determinística** | Limpeza de DOM, deduplicação, filtros léxicos, aderência TF-IDF/BM25 | Zero / 0ms |
| **1 — Modelos leves** | Fit Score + requisitos estruturados (Ollama local / Groq / Flash-Lite) | Baixo / rápido |
| **2 — Raciocínio + cache** | Currículo adaptado e Q&A apenas para vagas ≥ 75% (prompt caching) | Alto / preciso |

## Como rodar

### Requisitos

- Node.js v22+ e npm
- [Ollama](https://ollama.com) (opcional, mas recomendado — custo zero para triagem/estruturação)

```powershell
npm install          # instala dependências (Jest, tsx, better-sqlite3, …)
```

### Configuração (`.env`)

```powershell
Copy-Item .env.example .env    # depois edite .env
```

Providers e modelos são configurados **por tier** via `.env` — sem tocar em código:

```env
AI_LOCAL_PROVIDER=ollama     # triagem barata  → qualquer modelo local
AI_LOCAL_MODEL=qwen2.5:7b
AI_FAST_PROVIDER=ollama      # fallback rápido
AI_FAST_MODEL=qwen2.5:3b
AI_SMART_PROVIDER=anthropic  # raciocínio + prompt cache
AI_SMART_MODEL=claude-haiku-4-5
ANTHROPIC_API_KEY=sk-ant-...
```

Providers válidos: `ollama`, `groq`, `anthropic`, `openai`, `kimi`, `gemini` (ou qualquer outro nome — a chave é lida de `<PROVIDER>_API_KEY`, o modelo de `<PROVIDER>_MODEL` ou `AI_<TIER>_MODEL`). Tudo documentado comentado em `.env.example`.

### Comandos

```powershell
npm run cli -- <comando>          # roda o CLI em dev (tsx, sem build)

npm run cli -- import --pdf cv.pdf   # ingere seu currículo → storage/profile.draft.md
npm run cli -- run --dry-run         # simula o funil completo (nada é enviado)
npm run cli -- review                # fila de candidaturas NEEDS_HUMAN_INPUT
npm run cli -- status                # resumo do SQLite + uso de tokens

npm run build     # compila para dist/
npm run start -- <comando>   # roda o build compilado
```

### Ingestão do seu perfil (currículo)

1. Jogue o PDF em `storage/profile_inbox/` **ou** rode `npm run cli -- import --pdf seu-cv.pdf`
2. O sistema gera `storage/profile.draft.md` — **revise antes de aprovar** (anti-fabricação: nada entra no perfil sem vir de documento seu ou de edição manual)
3. Após aprovação, o perfil ativo fica em `src/config/profile.master.md` (editável à mão) e é compilado para `profile.master.json` (artefato do prompt-cache)

> Sem modelo configurado, o `import` apenas valida o PDF e gera rascunho mínimo. Enquanto isso, você pode preencher `profile.master.md` manualmente seguindo o formato do seed (inclui seção de Projetos Open Source).

### Testes e verificação

```powershell
npm run test        # 28 suites: unit + integration + e2e
npm run test:unit   # só unitários
npm run lint        # ESLint
npm run format      # Prettier
npx tsc --noEmit    # typecheck
```

## Estrutura do repositório

```text
CareerFacilator/
├── docs/            # Especificação de arquitetura (13 docs)
│   ├── pt-BR/       # versão em português (fonte da verdade)
│   └── en/          # versão em inglês
├── feature/         # Especificações BDD/Gherkin (13 .feature + DECISOES.md)
├── src/
│   ├── intake/      # Ingestão de perfil: PDF → estruturação → master.md (doc 13)
│   ├── ai/          # Router de tiers, triage, tailorer (prompt cache), token tracker
│   ├── scraper/     # domCleaner, sessionVault (AES-256-GCM)
│   ├── geo/         # dorkBuilder, eligibilityGuard, localeAdapter
│   ├── skills/      # core (registry/selector/injector) + library/ (SKILL.md + keywords.json)
│   ├── autofill/    # deterministicMatcher, wizardNavigator, formExecutor
│   ├── core/        # pipeline, autonomyEngine, escalationHandler
│   ├── email_application/  # resolver, composer, dispatcher, tracker
│   ├── db/          # schema + repository (SQLite)
│   ├── tracker/     # outcomeMonitor
│   ├── generator/   # resumeBuilder
│   ├── config/      # careerOps.config + loadConfig (.env)
│   └── cli/         # entrypoint
├── __tests__/       # 28 suites Jest (contratos em helpers/contracts.ts)
├── CONTRIBUTING.md  # Guia de contribuição (PT-BR) — CONTRIBUTING.en.md (EN)
└── AGENTS.md        # Guia para agentes de IA neste repo
```

## Documentação

- **[docs/README.md](docs/README.md)** — índice geral (PT-BR + EN)
- **[docs/pt-BR/README.md](docs/pt-BR/README.md)** — arquitetura, otimização de IA, skills, modos, escopo geográfico, confiabilidade, e-mail e ingestão de perfil
- **[feature/README.md](feature/README.md)** — cenários BDD cobrindo todos os módulos
- **[feature/DECISOES.md](feature/DECISOES.md)** — ambiguidades e decisões pendentes
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — fluxo, commits (Conventional Commits) e regras de PR

## Stack

Node.js v22+ · TypeScript strict · Jest + ts-jest · better-sqlite3 (+ Drizzle planejado) · node-html-parser + turndown · Zod · Playwright (a conectar) · Ollama/Groq/Anthropic/OpenAI/Kimi/Gemini via `.env`

## Limitações atuais

- **Clientes LLM**: `resolveModel()` devolve provider/modelo/endpoint do `.env`, mas os clients reais (Ollama, Anthropic…) ainda não foram implementados — `triageModel`, `tailorModel` e o structurer do intake são injetáveis e testados com mocks.
- **Discovery/browser**: o pipeline recebe vagas já extraídas (`rawJobs`); scraping com Playwright ainda não conectado.
- **`run`/`review`/`status`** do CLI são stubs de orientação — o funil completo (`runApplicationPipeline`) é exercido pelos testes e2e com deps mockadas.
- **SMTP**: `emailDispatcher` implementado com transporte injetável; nodemailer real a conectar.

## Próximos passos

Ver [docs/pt-BR/12-roadmap.md](docs/pt-BR/12-roadmap.md) — próxima etapa: clients de modelo reais (Ollama primeiro) e wiring do `run` no CLI.
