# 2. Arquitetura do Sistema

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    0. PROFILE INTAKE (src/intake/)                      │
│  • PDFs do usuário → extração → rascunho MD → aprovação → compilação    │
│  • Produz o Master CV aprovado consumido pelas camadas 1 a 3            │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    1. DISCOVERY & SCRAPER ENGINE                        │
│  • Playwright Stealth + Parsers específicos (Greenhouse, Lever, etc.)   │
│  • Limpeza de DOM (HTML -> Markdown enxuto, removendo nav/footer/ads)   │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                 2. FUNIL DE TRIAGEM & OTIMIZAÇÃO DE IA                  │
│  [Filtro RegEx/Léxico] ──► [LLM Rápida/Local: Fit Score + JSON Schema]  │
│         (Descarta 60%)               (Descarta +25% | Score < 75)       │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ (Apenas Top 15% das Vagas)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│               3. GERADOR DE ATIVOS (COM PROMPT CACHING)                 │
│  • Cache Fixo: Master CV + Projetos + Respostas Padrão                  │
│  • Output: Currículo Sob Medida (PDF/DOCX) + Cover Letter + Q&A         │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│             4. AUTO-FILL & HUMAN-IN-THE-LOOP (PLAYWRIGHT)               │
│  • Mapeamento semântico de inputs + Injeção nativa de eventos SPA       │
│  • Pausa obrigatória antes do botão "Enviar" (Aprovação / Captcha)      │
└─────────────────────────────────────────────────────────────────────────┘
```

## 3. Stack Tecnológica (100% TypeScript)

- **Runtime & Linguagem:** Node.js (v22+) / TypeScript (Strict Mode)
- **Automação de Navegador:** `playwright` + `playwright-extra` (Stealth plugin)
- **Extração Limpa de Texto:** `@mozilla/readability` + `turndown` (converte HTML sujo em Markdown mínimo para economizar tokens)
- **Orquestração & Roteamento de IA:** Vercel AI SDK (`ai`) + `zod` (para Structured Outputs garantidos sem alucinação de formato)
- **Provedores de IA (Roteamento Híbrido):**
  - *Local / Triagem:* Ollama (`qwen2.5:7b` / `llama3.2`) e/ou `@huggingface/transformers` (embeddings locais)
  - *Nuvem Otimizada:* Groq / Gemini Flash / Claude Haiku (com `cacheControl` ativado)
- **Banco de Dados Local-First:** SQLite via `better-sqlite3` + Drizzle ORM (controle de estado, histórico de vagas, logs de tokens gastos)
- **Geração de Currículo PDF:** `puppeteer` ou `@react-pdf/renderer` (templates HTML/CSS limpos otimizados para leitura por sistemas ATS)

## 4. Estrutura de Diretórios do Projeto

```text
career-facilitator-ts/
├── src/
│   ├── config/
│   │   ├── profile.master.md        # Perfil-mestre editável (fonte da verdade)
│   │   ├── profile.master.json      # Compilado do MD — artefato do cache de prompt
│   │   ├── careerOps.config.ts      # Roteamento de modelos, limites de score e orçamento
│   │   ├── loadConfig.ts            # Cadeia de .env: <home> → ./.env → process.env
│   │   ├── paths.ts                 # Diretório de dados (CAREER_HOME → ~/.careerfacilator)
│   │   └── envFile.ts               # Leitura/escrita de chaves do .env (config set/unset)
│   ├── intake/
│   │   ├── intakeCore.ts            # Orquestra o fluxo: inbox/comando → aprovação → compilação
│   │   ├── inboxScanner.ts          # Varre profile_inbox/ e arquiva PDFs em processed/
│   │   ├── pdfExtractor.ts          # Extrai a camada de texto do PDF (sem OCR silencioso)
│   │   ├── profileStructurer.ts     # Estrutura via LLM + Zod só o que consta no documento
│   │   ├── masterProfileStore.ts    # Rascunho, merge/replace e histórico de versões
│   │   └── profileCompiler.ts       # Valida o MD e compila o JSON do cache de prompt
│   ├── scraper/
│   │   ├── browser.ts               # Instância persistente do Playwright (sessões logadas)
│   │   ├── sessionVault.ts          # Cookies/storageState criptografados + fila com jitter
│   │   ├── domCleaner.ts            # Remove scripts, CSS e boilerplate (economiza ~70% tokens)
│   │   └── adapters/                # Extratores otimizados (greenhouse.ts, lever.ts, linkedin.ts)
│   ├── ai/
│   │   ├── router.ts                # Seletor dinâmico de modelo (Local vs. Fast vs. Smart)
│   │   ├── triageAgent.ts           # Avalia Fit Score e extrai requisitos via Zod
│   │   ├── tailorerAgent.ts         # Adapta o CV e gera respostas usando Prompt Caching
│   │   └── tokenTracker.ts          # Telemetria de custo e tokens economizados por execução
│   ├── skills/
│   │   ├── core/                    # skillRegistry, skillSelector, skillInjector
│   │   └── library/                 # Skills declarativas (SKILL.md + keywords.json)
│   ├── geo/
│   │   ├── geoConfig.ts             # 'NATIONAL' | 'INTERNATIONAL' | 'BOTH'
│   │   ├── dorkBuilder.ts           # Queries de busca por mercado e idioma
│   │   ├── eligibilityGuard.ts      # Filtra visto, fuso horário e contrato
│   │   └── localeAdapter.ts         # Alterna idioma do CV e pretensão salarial
│   ├── core/
│   │   ├── autonomyEngine.ts        # Motor de decisão FULL_AUTO vs SEMI_AUTO
│   │   └── escalationHandler.ts     # Detector de CAPTCHA/OTP → NEEDS_HUMAN_INPUT
│   ├── generator/
│   │   ├── resumeBuilder.ts         # Compila os dados adaptados em PDF ATS-friendly
│   │   └── templates/               # Templates HTML/React minimalistas
│   ├── autofill/
│   │   ├── formInspector.ts         # Mapeia labels, aria-labels e placeholders da página
│   │   ├── deterministicMatcher.ts  # Preenche dados padrão (CPF, GitHub, LinkedIn) sem IA
│   │   ├── wizardNavigator.ts       # Loop de navegação em formulários multi-etapas
│   │   └── formExecutor.ts          # Preenche inputs, selects, upload de PDF e dispara eventos
│   ├── email_application/
│   │   ├── emailAppCore.ts          # Orquestrador do fluxo de candidatura por e-mail
│   │   ├── recipientResolver.ts     # Extração, validação e deduplicação de destinatários
│   │   ├── emailComposer.ts         # Assunto/corpo com LLM + cache e vínculo de anexo
│   │   ├── emailDispatcher.ts       # Envio via SMTP/API, fila e integração com o cofre
│   │   ├── emailTracker.ts          # Persistência de logs, status e histórico
│   │   └── emailAppConfig.ts        # Regras de aprovação, idioma e limites de envio
│   ├── tracker/
│   │   └── outcomeMonitor.ts        # Feedback loop pós-candidatura (IMAP/Gmail API)
│   ├── db/
│   │   ├── schema.ts                # Tabelas Drizzle (jobs, applications, ai_usage_logs)
│   │   └── repository.ts            # Deduplicação por URL/Hash e controle de status
│   └── cli/
│       └── index.ts                 # Interface de terminal interativa para revisar e aprovar envios
├── storage/
│   ├── career_facilitator.db        # Banco SQLite local
│   ├── profile_inbox/               # Pasta monitorada para PDFs do usuário
│   ├── profile.draft.md             # Rascunho do perfil aguardando aprovação
│   ├── profile_history/             # Versões anteriores do perfil-mestre
│   └── generated_resumes/           # PDFs gerados sob demanda por vaga
├── package.json
└── tsconfig.json
```

---

« [Anterior: Visão Geral](01-visao-geral.md) | [Índice](README.md) | [Próximo: Otimização de IA →](03-otimizacao-de-ia.md)
