# AGENTS.md — Guia para agentes de IA

## O que é este projeto

**CareerFacilator AI (TypeScript Edition)** — sistema autônomo de prospecção, triagem semântica, adaptação de currículos e candidatura assistida a vagas de emprego, com foco em otimização de custo de inferência (funil determinístico → modelos leves → modelos de raciocínio com prompt caching).

**Estado atual:** especificação + implementação de `src/` — suites Jest passam (unit + integration + e2e). SMTP real via nodemailer + cofre AES-256-GCM, WhatsApp (fila/Evolution API) e formulário web via Playwright (`pageInspector` + `playwrightExecutor` — `pageFactory(url)` real) conectados + stealth (`playwright-extra` + `puppeteer-extra-plugin-stealth`), ritmo humano (`AUTOFILL_STEALTH`/`AUTOFILL_HUMAN_PACE`) e relaunch visível em CAPTCHA/OTP/login wall (`AUTOFILL_VISIBLE_ON_ESCALATION`; `login <url|portal>` autentica o perfil). Perguntas do form sem resposta por nenhuma fonte vão ao tier SMART ao vivo (`AUTOFILL_LIVE_ANSWERS` — 1 chamada/etapa, perfil-RAG como única fonte; required respondida só ali pausa o auto-envio — anti-fabricação) e grupos de radio viram campo `choice`. Ollama funciona de verdade via `import`/`run`; providers remotos OpenAI-compatíveis também (`openaiCompatibleClient` — deepseek/groq/openai/kimi/moonshot/openrouter/together/gemini-compat + `<P>_BASE_URL` custom; Anthropic/Gemini nativos sem adapter). Discovery roda com APIs/RSS públicas (`remoteok`, `remotive`, `jobicy`, `arbeitnow`, `workingnomads`, `himalayas`, `weworkremotely`) + registry de 145 fontes; fontes `html` usam fallback genérico HTML+LLM (`DISCOVERY_USE_GENERIC_FALLBACK`, modelo via `DISCOVERY_GENERIC_MODEL` ou herança do tier `AI_LOCAL_*`); Gupy usa API pública `portal.gupy.io/api/job-search/jobs` (server-side, sem browser); boards ATS `greenhouse`/`lever` rodam via `DISCOVERY_ATS_BOARDS=provider:slug`; `linkedin`/`linkedin-br` usam a sessão (`renderText`) p/ jobs (`/jobs/search`) e posts de vagas (`/search/results/content/` — contato do texto ou OCR tesseract.js, `DISCOVERY_POSTS_OCR`); dorks orgânicos rodam via `searchAdapter` (DDG/Bing + fallback por query).

## Onde encontrar as coisas

| Caminho                              | Conteúdo                                                                                                                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/pt-BR/`                        | Especificação de arquitetura (fonte da verdade, 16 docs numerados)                                                                                                                                   |
| `docs/en/`                           | Mesma especificação traduzida para inglês                                                                                                                                                            |
| `tutorials/pt-BR/` e `tutorials/en/` | Guias práticos de instalação (repositório, npm global, instalador do release — app + CLI) e configuração de modelos de IA                                                                                          |
| `feature/*.feature`                  | Cenários BDD em Gherkin PT (`# language: pt`), um por módulo                                                                                                                                         |
| `feature/DECISOES.md`                | Ambiguidades de requisito e decisões pendentes — **consultar antes de implementar**                                                                                                                  |
| `src/`                               | Implementação: `intake/`, `ai/`, `discovery/`, `scraper/`, `geo/`, `skills/`, `autofill/`, `core/`, `email_application/`, `whatsapp_application/`, `utils/`, `db/`, `tracker/`, `generator/`, `cli/` |

## Convenções do projeto

### Nomenclatura

- Produto: **CareerFacilator AI** (a spec antiga usava "CareerOps AI" — normalizado; identificadores de código da spec como `CareerOpsConfig`/`careerOps.config.ts` permanecem como no documento original)
- Diretório de código planejado: `career-facilitator-ts/src/` (ver `docs/pt-BR/02-arquitetura.md`)
- Extensões sempre `.ts` — a spec antiga usava `.kf` no módulo de e-mail (resquício de outro sistema, já normalizado)

### Documentação

- Docs em **PT-BR e EN** sempre em pares (`docs/pt-BR/NN-nome.md` ↔ `docs/en/NN-name.md`)
- Tutoriais em **PT-BR e EN** sempre em pares (`tutorials/pt-BR/NN-nome.md` ↔ `tutorials/en/NN-name.md`)
- Numeração de seção interna preserva os números originais da spec (ex: `05-skills` começa em "# 8.")
- Navegação « anterior / índice / próximo » ao fim de cada doc
- Ao alterar um doc PT-BR, atualizar o equivalente EN; o mesmo vale para tutoriais

### Specs BDD (`.feature`)

- `# language: pt` sempre; keywords `Funcionalidade`, `Contexto`, `Cenário`, `Esquema do Cenário`, `Exemplos`
- **Comportamental, não técnico:** proibido seletores CSS, SQL, nomes de função nos passos — apenas estado observável (status como `APPLIED`, `NEEDS_HUMAN_INPUT` ficam em inglês por serem identificadores)
- Cenários com IA fixam a entrada no `Dado` — nunca dependem da saída real do modelo
- Ambiguidades: comentário `# Ambiguidade:` ao fim do arquivo + consolidar em `feature/DECISOES.md`

### Conceitos-chave do domínio

- **Máquina de estados:** `DISCOVERED → TRIAGED → TAILORED → READY_TO_REVIEW → APPLIED` (+ `SKIPPED`, `APPLIED_VIA_EMAIL`, `APPLIED_VIA_WHATSAPP`, `NEEDS_HUMAN_INPUT`, `REJECTED`, `INTERVIEW`, `ASSESSMENT_INVITED`, `DEFERRED`, `DRY_RUN`, `FAILED`)
- **Modos de execução:** `FULL_AUTO` / `SEMI_AUTO` / `HYBRID_THRESHOLD` (régua: 75 para tailoring, 88 para auto-envio)
- **Escopo de mercado:** `NATIONAL` / `INTERNATIONAL` / `BOTH`
- **Skills dinâmicas:** `SKILL.md` + `keywords.json`, seleção determinística (máx. 2 por vaga)
- **Perfil-mestre:** `profile.master.md` editável é a fonte da verdade; `profile.master.json` é o artefato compilado usado no cache de prompt. Ingestão via `src/intake/` (ver `docs/pt-BR/13-ingestao-de-perfil.md`) — anti-fabricação: nada entra no perfil sem vir de documento do usuário ou de edição manual
- **Canais de candidatura:** web > e-mail > WhatsApp > `NEEDS_HUMAN_INPUT`. E-mail: credencial SMTP no cofre (`career vault set`), teto 45/dia (`EMAIL_MAX_DAILY`), corpo via template `email_template.md`. WhatsApp: `MANUAL_QUEUE` (fila no `review` — confirmar envio via `mark <url> whatsapp` ou review interativo p/ ativar o cooldown) ou `EVOLUTION_API` — ver `docs/pt-BR/14` e `docs/pt-BR/15`

### CLI e dados do usuário

- `npm run cli` sem argumentos abre o **shell interativo** (`career>`); `bin/career.cjs` + `npm link` expõe a CLI global `career`/`career-facilitator`
- `career ui` / `career serve` sobem a **interface gráfica local** (`src/ui/` — node:http em 127.0.0.1 + token de sessão; assets de `src/ui/public/` viram sea assets no exe). Comandos rodam como subprocesso do próprio binário (stdout→SSE, stdin alimentável); env mascarado+fonte, cofre só refs. App desktop Tauri em `desktop/` (externalBin=exe + career-runtime + skills; no launch grava o shim `career` no PATH do usuário — `--career-cli` é o modo passthrough p/ AppImage) — build via `npm run build:desktop` (Rust só no CI) — ver `docs/pt-BR/16-interface-grafica.md`
- Marcação manual da fila: `mark <url|id> <status>` (applied|email|whatsapp|skipped|failed|rejected|interview|assessment), `remove <url|id>` (tira do histórico → reprocessável), `retry [url|id]` (refaz o estágio web das vagas NEEDS_HUMAN_INPUT — mesma malha login-cofre/OTP do run, sem discovery/triagem) e `review` interativo no shell — ver `feature/12` e `feature/15`
- `login <url|portal>` abre o browser visível no perfil persistente p/ login manual — a sessão é reaproveitada por fontes render:true e autofill
- Dados do usuário (jobs.sqlite, profile.*, inbox) resolvem sob `CAREER_HOME` → default `~/.careerfacilator`; o `.env` do repo fixa `CAREER_HOME=.` para manter dev local — ver `docs/pt-BR/09-configuracao.md` §11.1
- Precedência de env: `<home>/.env` < `./.env` < `<exe>/.env` (só SEA) < `process.env`; `career config set|get|unset|init|path` manipula o `.env` do home via `src/config/envFile.ts`. No binário SEA, `CAREER_HOME` relativo ancora na pasta do executável (modo portátil real)
- Executável SEA: módulos externos (playwright*/stealth, pdf-parse, tesseract.js) + Chromium + tessdata vivem em `career-runtime/` ao lado do binário — carregados por `src/utils/runtimeModules.ts` via `createRequire` (overrides: `CAREER_RUNTIME`, `CAREER_SKILLS` p/ a library); `career runtime status` diagnostica (`runtime setup` = builds locais `npm run dist`, sem tarball publicado no release). Sem runtime → degradação p/ mensagens/revisão (`feature/16`)

## Stack planejada (quando implementar)

Node.js v22+ / TypeScript strict · Playwright + stealth · Vercel AI SDK + Zod · `node:sqlite` builtin (sem dep nativa — viabiliza exe single-file) · Ollama (triagem local) + providers OpenAI-compatíveis via `openaiCompatibleClient` (deepseek/groq/openai/kimi/openrouter/together; Anthropic/Gemini nativos sem adapter)

## Testes (`__tests__/`)

- Jest + ts-jest, 3 projects: `unit/`, `integration/`, `e2e/` — suites derivadas dos `.feature` + contratos de infra, todas verdes
- Descrições de `describe`/`it` e comentários nos testes sempre em **inglês**
- **Contratos** das assinaturas de `src/`: `__tests__/helpers/contracts.ts` — atualizar lá antes de mudar testes em massa
- Mocks de deps externas em `__tests__/helpers/mocks.ts` — nunca importar playwright/nodemailer/SDKs nos testes
- Comandos: `npm run test:unit|test:integration|test:e2e` · `npx tsc --noEmit` deve ficar limpo
- `domCleaner` usa `node-html-parser` + `turndown` (CJS) — **não** reintroduzir `jsdom` (deps ESM-only quebram o Jest)

## Verificação

Builds: `npm run build:exe` gera o executável SEA completo (`esbuild` → `dist/bundle/` → blob → postject em `dist/career-<os>-<arch>`); `npm run build:runtime` monta `dist/career-runtime/` (node_modules sidecar + browsers + tessdata) e `skills/`; `npm run package:dist`/`dist` empacota `career-<os>.zip` + `career-runtime-*.tar.gz`. Releases: tag `v*` publica só os instaladores desktop `career-ui-*` (NSIS exe / dmg / AppImage) — o pacote CLI é artefato intermediário que vira sidecar do Tauri, não é mais publicado. Para alterações em docs/specs/testes:

```powershell
# Resíduos proibidos (deve retornar 0 fora de identificadores de código)
# .kf, cite:, \ge, "CareerOps AI" na prosa

# Todo .feature deve começar com "# language: pt"
Select-String -Path feature\*.feature -Pattern '^# language: pt'

# Links relativos entre docs devem resolver
```

## Regras para agentes

1. **Antes de implementar qualquer módulo**, ler o doc correspondente em `docs/en/` e o `.feature` correspondente — e verificar `feature/DECISOES.md` por decisões pendentes daquele módulo.
2. **Não implementar código** a menos que explicitamente pedido — o projeto está em fase de implementação; siga os contratos em `__tests__/helpers/contracts.ts`.
3. **Human-in-the-loop é requisito, não opção:** nenhum fluxo pode enviar candidatura sem respeitar o modo de execução configurado.
4. **Nunca commitar segredos** — credenciais SMTP/sessões vivem no cofre criptografado (ver `docs/pt-BR/10-confiabilidade.md`).
