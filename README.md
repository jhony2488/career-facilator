# CareerFacilator AI (TypeScript Edition)

Sistema autônomo de prospecção, triagem semântica, adaptação de currículos e candidatura assistida com otimização de inferência.

> **Status:** especificação completa + implementação inicial — **36 suites Jest verdes** e client Ollama real funcionando (streaming + JSON estruturado). Automação de browser (Playwright) e SMTP reais ainda não conectados (ver [Limitações atuais](#limitações-atuais)).

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
AI_LOCAL_MODEL=hermes3:latest
AI_FAST_PROVIDER=ollama      # fallback rápido
AI_FAST_MODEL=hermes3:latest
AI_SMART_PROVIDER=anthropic  # raciocínio + prompt cache
AI_SMART_MODEL=claude-haiku-4-5
ANTHROPIC_API_KEY=sk-ant-...

# tuning opcional: OLLAMA_KEEP_ALIVE, AI_TEMPERATURE, AI_NUM_PREDICT,
# AI_EMBEDDINGS_ENABLED (RAG semântico via nomic-embed-text), LEXICAL_MIN_TERMS
```

Providers válidos: `ollama`, `groq`, `anthropic`, `openai`, `kimi`, `gemini` (ou qualquer outro nome — a chave é lida de `<PROVIDER>_API_KEY`, o modelo de `<PROVIDER>_MODEL` ou `AI_<TIER>_MODEL`). Tudo documentado comentado em `.env.example`.

### Comandos

```powershell
npm run cli                       # shell interativo (prompt career>) — dev, sem build
npm run cli -- <comando>          # comando único em dev

npm run cli -- config               # roteamento de modelos + caminhos de dados resolvidos
npm run cli -- import --pdf cv.pdf  # estrutura seu CV via Ollama → profile.draft.md
npm run cli -- import --inbox       # processa PDFs pendentes na área de entrada
npm run cli -- import --inbox --watch  # monitora a pasta: solte um PDF e ele é processado
npm run cli -- run --jobs-file jobs.json --dry-run   # funil completo (jobs.json = [{url, html}])
npm run cli -- approve              # promove o rascunho de perfil a profile.master.md
npm run cli -- review               # fila NEEDS_HUMAN_INPUT / READY_TO_REVIEW + fila WhatsApp
npm run cli -- status               # contagens por status no jobs.sqlite
npm run cli -- config check         # testa endpoint+modelo dos 3 tiers (preflight)
npm run cli -- vault set smtp-main  # grava credencial SMTP cifrada (interativo no shell)
npm run cli -- vault list           # refs gravadas no cofre (sem expor segredos)

npm run build     # compila para dist/
npm run start -- <comando>   # roda o build compilado
```

### CLI global (`career`)

```powershell
npm link            # uma vez — registra 'career' e 'career-facilitator' no PATH
career              # shell interativo de qualquer pasta
career status       # comando único
```

Instalado globalmente, os dados vão para **`~/.careerfacilator/`** (ou `CAREER_HOME=<dir>`): `jobs.sqlite`, `profile_inbox/`, `profile.master.*` e o `.env` global. Tudo configurável pelo próprio comando:

```powershell
career config init                        # cria ~/.careerfacilator + .env template
career config path                        # mostra home e arquivo de config
career config set AI_SMART_PROVIDER groq  # grava no .env global
career config set GROQ_API_KEY gsk_...    # chaves ficam fora do código
career config get AI_LOCAL_MODEL
career config unset AI_LOCAL_MODEL
```

Paths individuais sobrescrevem via env: `PROFILE_INBOX_DIR`, `PROFILE_DRAFT_PATH`, `PROFILE_MASTER_PATH`, `PROFILE_COMPILED_PATH`, `PROFILE_HISTORY_DIR`, `JOBS_DB_PATH`.

> **Dev no repo:** o `.env` local tem `CAREER_HOME=.`, então os dados continuam em `storage/` e `src/config/` como antes.

### Ingestão do seu perfil (currículo)

1. Jogue o PDF em `storage/profile_inbox/` (dev) ou no inbox do `CAREER_HOME` (global — ver `career config path`) **e** rode `import --inbox` — ou direto: `import --pdf seu-cv.pdf`
2. PDFs processados saem da inbox para `profile_inbox/processed/` — nada é reimportado
3. O sistema gera `storage/profile.draft.md` — **revise antes de aprovar** (anti-fabricação: nada entra no perfil sem vir de documento seu ou de edição manual)
4. Aprove com `approve` — o perfil ativo fica em `src/config/profile.master.md` (editável à mão) e é compilado para `profile.master.json` (artefato do prompt-cache)

> Sem modelo configurado, o `import` apenas valida o PDF e gera rascunho mínimo. Enquanto isso, você pode preencher `profile.master.md` manualmente seguindo o formato do seed (inclui seção de Projetos Open Source).

### Testes e verificação

```powershell
npm run test        # 36 suites: unit + integration + e2e
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
│   ├── email_application/  # resolver, composer (template), dispatcher, smtpTransport, credentialVault, tracker
│   ├── whatsapp_application/ # resolver, composer, evolutionClient, appCore (MANUAL_QUEUE|EVOLUTION_API)
│   ├── utils/       # textTemplate — renderer {{placeholder}} compartilhado
│   ├── db/          # schema + repository (SQLite)
│   ├── tracker/     # outcomeMonitor
│   ├── generator/   # resumeBuilder
│   ├── config/      # careerOps.config + loadConfig + paths/envFile (.env, CAREER_HOME)
│   └── cli/         # entrypoint — shell interativo + comandos (import/run/review/status/config)
├── bin/career.cjs   # wrapper p/ CLI global (npm link → career)
├── __tests__/       # 36 suites Jest (contratos em helpers/contracts.ts)
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

- **Clientes de nuvem**: Ollama funciona de verdade (chat/streaming/embeddings + `format:'json'` + retry). Groq/Anthropic/OpenAI/Kimi/Gemini resolvíveis por `.env`, mas sem adapter — erro explícito ao usar.
- **Discovery/browser**: `run` consome `jobs.json` (`[{url, html}]`); scraping com Playwright ainda não conectado — `pageFactory` é um stub sem campos, então formulários reais não são preenchidos.
- **Canais**: e-mail real via nodemailer + cofre AES-256-GCM (`vault set smtp-main`, docs/pt-BR/14); WhatsApp por fila manual ou Evolution API (docs/pt-BR/15).
- **`import` sem Ollama**: exige `ollama serve` + `ollama pull <modelo>`; sem client configurado gera só rascunho mínimo.

## Próximos passos

Ver [docs/pt-BR/12-roadmap.md](docs/pt-BR/12-roadmap.md) — próxima etapa: adapter de nuvem (Groq/Anthropic), discovery com Playwright e nodemailer real.
