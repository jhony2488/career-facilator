# CareerFacilator AI (TypeScript Edition)

Sistema autônomo de prospecção, triagem semântica, adaptação de currículos e candidatura assistida com otimização de inferência.

Versão em português do README. [English version (README-en.md)](README-en.md).

> **Status:** especificação completa + implementação — suites Jest verdes e client Ollama real + providers OpenAI-compatíveis funcionando (streaming + JSON estruturado). Discovery roda com APIs/RSS públicas; SMTP via nodemailer e WhatsApp via Evolution API conectados; Playwright ainda não conectado (ver [Limitações atuais](#limitações-atuais)).

## O que é

O CareerFacilator AI automatiza o ciclo ponta a ponta de busca e candidatura a vagas (LinkedIn, Greenhouse, Lever, Gupy, Workday e portais próprios) operando sob um **Funil de Otimização de Inferência em 3 Camadas**:

| Camada                     | Função                                                                 | Custo          |
| -------------------------- | ---------------------------------------------------------------------- | -------------- |
| **0 — Determinística**     | Limpeza de DOM, deduplicação, filtros léxicos, aderência TF-IDF/BM25   | Zero / 0ms     |
| **1 — Modelos leves**      | Fit Score + requisitos estruturados (Ollama local / Groq / Flash-Lite) | Baixo / rápido |
| **2 — Raciocínio + cache** | Currículo adaptado e Q&A apenas para vagas ≥ 75% (prompt caching)      | Alto / preciso |

## Como rodar

### Requisitos

- Node.js v22+ e npm
- [Ollama](https://ollama.com) (opcional, mas recomendado — custo zero para triagem/estruturação)

```powershell
npm install          # instala dependências (Jest, tsx, esbuild, postject, node:sqlite builtin, …)
```

### Configuração (`.env`)

```powershell
Copy-Item .env.example .env    # depois edite .env
```

Providers e modelos são configurados **por tier** via `.env` — sem tocar em código:

```env
AI_LOCAL_PROVIDER=ollama      # triagem barata  → qualquer modelo local
AI_LOCAL_MODEL=hermes3:latest
AI_FAST_PROVIDER=ollama       # fallback rápido
AI_FAST_MODEL=hermes3:latest
AI_SMART_PROVIDER=deepseek    # raciocínio + prompt cache
AI_SMART_MODEL=deepseek-chat  # default do provider (~$0.60/dia p/ 100 envios)
DEEPSEEK_API_KEY=sk-...

# tuning opcional: OLLAMA_KEEP_ALIVE, AI_TEMPERATURE, AI_NUM_PREDICT,
# AI_EMBEDDINGS_ENABLED (RAG semântico via nomic-embed-text), LEXICAL_MIN_TERMS
```

Providers com adapter de geração: `ollama` + **qualquer OpenAI-compatível** — `deepseek`, `groq`, `openai`, `kimi`/`moonshot`, `openrouter`, `together`, `gemini`-compat, ou outro via `<PROVIDER>_BASE_URL` (`openaiCompatibleClient.ts`). A chave é lida de `<PROVIDER>_API_KEY`, o modelo de `<PROVIDER>_MODEL` ou `AI_<TIER>_MODEL`. Anthropic e Gemini **nativos** ainda não têm adapter (o Gemini funciona pelo endpoint OpenAI-compat do Google). Tudo documentado comentado em `.env.example`.

### Comandos

```powershell
npm run cli                       # shell interativo (prompt career>) — dev, sem build
npm run cli -- <comando>          # comando único em dev

npm run cli -- config               # roteamento de modelos + caminhos de dados resolvidos
npm run cli -- import --pdf cv.pdf  # estrutura seu CV via Ollama → profile.draft.md
npm run cli -- import --inbox       # processa PDFs pendentes na área de entrada
npm run cli -- import --inbox --watch  # monitora a pasta: solte um PDF e ele é processado
npm run cli -- run --jobs-file jobs.json --dry-run   # funil completo (jobs.json = [{url, html}])
npm run cli -- run                  # sem --jobs-file, executa descoberta nas fontes ativas
npm run cli -- discover             # lista vagas descobertas (dry-run lista fontes ativas)
npm run cli -- discover --max-jobs 10 --sources remoteok,remotive  # descoberta filtrada
npm run cli -- scan remoteok        # testa uma única fonte e imprime amostras
npm run cli -- approve              # promove o rascunho de perfil a profile.master.md
npm run cli -- review               # fila NEEDS_HUMAN_INPUT / READY_TO_REVIEW + fila WhatsApp
npm run cli -- status               # contagens por status no jobs.sqlite
npm run cli -- config check         # testa endpoint+modelo dos 3 tiers (preflight)
npm run cli -- vault set smtp-main  # grava credencial SMTP cifrada (interativo no shell)
npm run cli -- vault list           # refs gravadas no cofre (sem expor segredos)
npm run cli -- whatsapp setup       # cria instância Evolution API + QR no terminal p/ parear
npm run cli -- whatsapp status      # estado da conexão WhatsApp
npm run cli -- help                 # help completo por seção (no shell: 'help')

npm run build     # compila TypeScript para dist/
npm run build:exe # gera blob SEA (dist/bundle/) — a injeção no binário do SO é feita no CI ou manualmente
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

> **Tutoriais detalhados:** veja instruções passo a passo de instalação pelo repositório, npm global, binários de release e configuração de modelos (incluindo Ollama por capacidade de RAM) em [tutorials/README.md](tutorials/README.md).

> **Dev no repo:** o `.env` local tem `CAREER_HOME=.`, então os dados continuam em `storage/` e `src/config/` como antes.

### Executável standalone (GitHub Releases)

Baixe o binário da aba [Releases](https://github.com/jhony2488/career-facilitator/releases) — **não precisa de Node.js**:

| Arquivo                  | Primeiro uso                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `career-windows-x64.exe` | SmartScreen pode avisar (binário sem assinatura): "Mais informações → Executar mesmo assim" |
| `career-macos-arm64`     | `chmod +x` + `xattr -d com.apple.quarantine career-macos-arm64` (Gatekeeper)                |
| `career-linux-x64`       | `chmod +x`                                                                                  |

O executável usa **a mesma configuração** dos outros modos: `career config init` cria `~/.careerfacilator/.env`, `config set|get` edita, e um `.env` com `CAREER_HOME=.` na pasta do exe mantém os dados portáteis ao lado dele. Para a biblioteca de skills no exe, copie `src/skills/library/` para `skills/` na mesma pasta.

> **Diferenças do exe:** extração de PDF cai no modo regex (sem `pdf-parse`) — PDFs com camada de texto funcionam normalmente. O Playwright também não é embutido (incompatível com SEA single-file): formulários web seguem para e-mail, WhatsApp ou a fila de revisão — para autofill de formulários use o fluxo npm/`npm link`. `career --version` mostra a versão do `package.json` (o release valida que a tag `v*` coincide com ela).

Os builds rodam no GitHub Actions (`.github/workflows/release.yml`): tag `v*` → matrix Windows/macOS/Linux (Node SEA single-file) → artefatos anexados ao release.

### Ingestão do seu perfil (currículo)

1. Jogue o PDF em `storage/profile_inbox/` (dev) ou no inbox do `CAREER_HOME` (global — ver `career config path`) **e** rode `import --inbox` — ou direto: `import --pdf seu-cv.pdf`
2. PDFs processados saem da inbox para `profile_inbox/processed/` — nada é reimportado
3. O sistema gera `storage/profile.draft.md` — **revise antes de aprovar** (anti-fabricação: nada entra no perfil sem vir de documento seu ou de edição manual)
4. Aprove com `approve` — o perfil ativo fica em `src/config/profile.master.md` (editável à mão) e é compilado para `profile.master.json` (artefato do prompt-cache)

> Sem modelo configurado, o `import` apenas valida o PDF e gera rascunho mínimo. Enquanto isso, você pode preencher `profile.master.md` manualmente seguindo o formato do seed (inclui seção de Projetos Open Source).

### Sequência sugerida de uso

1. Instale e configure a IA ([tutoriais 01–05](tutorials/pt-BR/README.md)) — `config check` precisa passar o tier LOCAL
2. Importe seu CV (`import --pdf`), revise o rascunho e `approve`
3. Confira a descoberta sem custo de IA: `discover --dry-run` e `scan <fonte>`
4. Rode o funil no seguro: `run --dry-run` → depois `run`
5. Trabalhe a fila: `review` → `status`
6. Opcional: canais de envio — e-mail (`vault set smtp-main` + `EMAIL_*`) e WhatsApp (`whatsapp setup`)

Detalhe de cada etapa: [tutorial 07 — Sequência de uso](tutorials/pt-BR/07-sequencia-de-uso.md).

### Testes e verificação

```powershell
npm run test        # unit + integration + e2e
npm run test:unit   # só unitários
npm run lint        # ESLint
npm run format      # Prettier
npx tsc --noEmit    # typecheck
```

## Estrutura do repositório

```text
CareerFacilator/
├── docs/            # Especificação de arquitetura (16 docs)
│   ├── pt-BR/       # versão em português (fonte da verdade)
│   └── en/          # versão em inglês
├── feature/         # Especificações BDD/Gherkin (14 .feature + DECISOES.md)
├── src/
│   ├── intake/      # Ingestão de perfil: PDF → estruturação → master.md (doc 13)
│   ├── ai/          # Router de tiers, triage, tailorer (prompt cache), token tracker
│   ├── discovery/   # registry, sourceRegistry, engine, fetcher, genericExtractor (LLM) + adapters (api/rss/html; ats/search/linkedin stub)
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
│   └── cli/         # entrypoint — shell interativo + comandos (import/run/discover/scan/review/status/config)
├── bin/career.cjs   # wrapper p/ CLI global (npm link → career)
├── __tests__/       # suites Jest (contratos em helpers/contracts.ts)
├── CONTRIBUTING.md  # Guia de contribuição (PT-BR) — CONTRIBUTING.en.md (EN)
└── AGENTS.md        # Guia para agentes de IA neste repo
```

## Documentação

- **[tutorials/README.md](tutorials/README.md)** — guias passo a passo de instalação (repositório, npm global, binários de release) e configuração de modelos de IA (Ollama e provedores remotos)
- **[docs/README.md](docs/README.md)** — índice geral (PT-BR + EN)
- **[docs/pt-BR/README.md](docs/pt-BR/README.md)** — arquitetura, otimização de IA, skills, modos, escopo geográfico, confiabilidade, e-mail e ingestão de perfil
- **[feature/README.md](feature/README.md)** — cenários BDD cobrindo todos os módulos
- **[feature/DECISOES.md](feature/DECISOES.md)** — ambiguidades e decisões pendentes
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — fluxo, commits (Conventional Commits) e regras de PR

## Stack

Node.js v22+ · TypeScript strict · Jest + ts-jest · `node:sqlite` (builtin, sem dep nativa → exe single-file) · node-html-parser + turndown · Zod · Playwright (a conectar) · Ollama/Groq/Anthropic/OpenAI/Kimi/Gemini via `.env`

## Limitações atuais

- **Clientes de nuvem**: Ollama funciona de verdade (chat/streaming/embeddings + `format:'json'` + retry); **qualquer provider OpenAI-compatível** também via `openaiCompatibleClient` (`/chat/completions`, SSE streaming, `response_format` json_schema→json_object, métricas `usage` — deepseek/groq/openai/kimi/openrouter/together/gemini-compat ou `<P>_BASE_URL` custom). Anthropic/Gemini nativos seguem sem adapter — erro explícito ao usar.
- **Discovery/browser**: `run` usa fontes públicas de API/RSS por padrão, aceita `jobs.json` (`[{url, html}]`) via `--jobs-file` e cobre fontes `html` sem estrutura via fallback genérico com LLM (`DISCOVERY_USE_GENERIC_FALLBACK`; modelo = `DISCOVERY_GENERIC_MODEL` ou herda `AI_LOCAL_*`, provider ollama) e fontes `search` via buscador (DDG/Bing + fallback anti-bot por query). Formulário web conectado via Playwright — `pageFactory(url)` abre a vaga em Chromium lazy (`AUTOFILL_HEADLESS`, `AUTOFILL_PROFILE_DIR` p/ reaproveitar logins), inspeciona campos (`pageInspector`), preenche com perfil + respostas IA (`executeLiveFill`), navega wizards multi-etapas e submete ou pausa conforme a régua (`AUTO_SUBMIT`/`PAUSE_BEFORE_SUBMIT`); CAPTCHA/OTP/erro de validação escalonam p/ NEEDS_HUMAN_INPUT.
- **Canais**: e-mail real via nodemailer + cofre AES-256-GCM (`vault set smtp-main`, docs/pt-BR/14); WhatsApp por fila manual ou Evolution API (docs/pt-BR/15).
- **`import` sem Ollama**: exige `ollama serve` + `ollama pull <modelo>`; sem client configurado gera só rascunho mínimo.

## Próximos passos

Ver [docs/pt-BR/12-roadmap.md](docs/pt-BR/12-roadmap.md) — discovery já roda com APIs/RSS públicas (`remoteok`, `remotive`, `jobicy`, `arbeitnow`, `workingnomads`, `himalayas`, `weworkremotely`), fallback genérico HTML+LLM e busca orgânica por dorks (DDG/Bing, incl. `linkedin-posts`/`linkedin-jobs` sem sessão); próximas etapas: adapters ATS por slug e LinkedIn autenticado.
