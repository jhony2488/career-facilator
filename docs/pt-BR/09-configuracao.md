# 11. Arquivo Central de Configuração (`src/config/careerOps.config.ts`)

Unifica o controle de autonomia, régua de precisão e seleção de mercado em um único objeto tipado:

```typescript
export interface CareerOpsConfig {
  execution: {
    mode: 'FULL_AUTO' | 'SEMI_AUTO' | 'HYBRID_THRESHOLD';
    minScoreForTailoring: number;   // Ex: 75 (mínimo para gerar currículo e preparar candidatura)
    minScoreForFullAuto: number;    // Ex: 88 (mínimo para enviar sozinho sem intervenção humana)
    maxDailyApplications: number;   // Trava de segurança diária (ex: 15 candidaturas/dia)
    companyCooldownDays: number;    // Não aplicar novamente na mesma empresa por X dias
    maxJobsPerRun: number;          // Máximo de vagas coletadas por execução do discovery (ex: 100)
    minJobsPerRun: number;          // Meta de candidaturas enviadas/run; aquém expande o discovery (0 = off)
    reviewExpirationDays: number;   // Expiração de READY_TO_REVIEW (ex: 7 dias → SKIPPED)
    escalationTimeoutMinutes: number;          // Espera máx. por intervenção humana (ex: 15 min)
    maxEscalationsPerPlatformPerDay: number;   // Circuit breaker por plataforma (ex: 3/dia)
  };
  autofill: {
    questionSimilarityThreshold: number;       // Similaridade mín. p/ reutilizar resposta em cache (ex: 0.9)
    fieldDefaults: Record<string, string>;     // Valores padrão p/ campos ausentes no perfil
  };
  tracking: {
    emailMonitoring: boolean;       // Monitoramento pós-candidatura — opt-in (default: false)
    outcomeConfidenceMin: number;   // Confiança mín. p/ mudar status automático (ex: 0.8)
  };
  marketScope: {
    target: 'NATIONAL' | 'INTERNATIONAL' | 'BOTH';
    national: {
      enabled: boolean;
      workModels: Array<'REMOTE' | 'HYBRID' | 'ONSITE'>;
      allowedCities: string[];
      contracts: Array<'CLT' | 'PJ'>;
      salaryExpectationBRL: number;
    };
    international: {
      enabled: boolean;
      regions: Array<'WORLDWIDE' | 'LATAM' | 'AMERICAS_TIMEZONE'>;
      blockVisaRequired: boolean; // Descarta vagas que exigem patrocínio de visto/residência local
      salaryExpectationUSD: number;
    };
  };
  profile: {
    inboxDir: string;      // Pasta monitorada para PDFs de currículo (src/intake/)
    draftPath: string;     // Rascunho do perfil aguardando aprovação humana
    masterPath: string;    // Perfil-mestre ativo (Markdown editável)
    compiledPath: string;  // JSON compilado usado no cache de prompt
    historyDir: string;    // Versões anteriores do perfil-mestre
  };
  email: {                 // Candidatura por e-mail (docs 11/14)
    enabled: boolean;
    dispatchMode: 'REQUIRE_REVIEW' | 'HYBRID_BY_SCORE' | 'AUTO_SEND_HIGH_FIT';
    minScoreAutoSend: number;
    attachTailoredResume: boolean;
    maxDailyEmails: number;      // Teto diário — default 45
    smtpCredentialRef: string;   // Ref do segredo no cofre — nunca a senha
    recipientCooldownDays: number;
    maxRetries: number;          // Transitório → retry; esgotado → NEEDS_HUMAN_INPUT
    retryBackoffMs: number;
    bodyTemplatePath: string;    // Template editável do corpo
    includeSalaryExpectation: boolean;
  };
  whatsapp: {              // Candidatura por WhatsApp (doc 15)
    enabled: boolean;
    mode: 'MANUAL_QUEUE' | 'EVOLUTION_API';
    apiUrlEnv: string;           // Nome da env com a URL da Evolution API
    apiInstance: string;
    apiKeyEnv: string;           // Nome da env com a apikey
    bodyTemplatePath: string;
    recipientCooldownDays: number;
    attachResume: boolean;       // Envia o PDF do currículo
    maxRetries: number;
    retryBackoffMs: number;
  };
}

export const defaultCareerOpsConfig: CareerOpsConfig = {
  execution: {
    mode: 'HYBRID_THRESHOLD',
    minScoreForTailoring: 75,
    minScoreForFullAuto: 88,
    maxDailyApplications: 15,
    companyCooldownDays: 30,
    maxJobsPerRun: 100,
    minJobsPerRun: 0,
    reviewExpirationDays: 7,
    escalationTimeoutMinutes: 15,
    maxEscalationsPerPlatformPerDay: 3,
  },
  autofill: {
    questionSimilarityThreshold: 0.9,
    fieldDefaults: {},
  },
  tracking: {
    emailMonitoring: false,
    outcomeConfidenceMin: 0.8,
  },
  marketScope: {
    target: 'BOTH',
    national: {
      enabled: true,
      workModels: ['REMOTE'],
      allowedCities: ['Recife', 'Jaboatão dos Guararapes'],
      contracts: ['PJ', 'CLT'],
      salaryExpectationBRL: 10000,
    },
    international: {
      enabled: true,
      regions: ['WORLDWIDE', 'LATAM', 'AMERICAS_TIMEZONE'],
      blockVisaRequired: true,
      salaryExpectationUSD: 4500,
    },
  },
  profile: {
    inboxDir: 'storage/profile_inbox/',
    draftPath: 'storage/profile.draft.md',
    masterPath: 'src/config/profile.master.md',
    compiledPath: 'src/config/profile.master.json',
    historyDir: 'storage/profile_history/',
  },
  email: {
    enabled: true,
    dispatchMode: 'HYBRID_BY_SCORE',
    minScoreAutoSend: 88,
    attachTailoredResume: true,
    maxDailyEmails: 45,
    smtpCredentialRef: 'smtp-main',
    recipientCooldownDays: 30,
    maxRetries: 3,
    retryBackoffMs: 60000,
    bodyTemplatePath: 'storage/email_template.md',
    includeSalaryExpectation: true,
  },
  whatsapp: {
    enabled: true,
    mode: 'MANUAL_QUEUE',
    apiUrlEnv: 'EVOLUTION_API_URL',
    apiInstance: 'default',
    apiKeyEnv: 'EVOLUTION_API_KEY',
    bodyTemplatePath: 'storage/whatsapp_template.md',
    recipientCooldownDays: 30,
    attachResume: true,
    maxRetries: 3,
    retryBackoffMs: 60000,
  },
};
```

## 11.1. Diretório de dados e CLI global

Os caminhos relativos de `profile` e `storage/` (incluindo `jobs.sqlite`) resolvem sob o **diretório de dados**:

- `CAREER_HOME` — override explícito do diretório;
- `~/.careerfacilator` — default quando a CLI roda instalada globalmente (`npm link`/`npm i -g`, binário `career`/`career-facilitator` via `bin/career.cjs`);
- Em dev no repo, o `.env` local fixa `CAREER_HOME=.`, mantendo os dados na pasta do projeto.

**Precedência de configuração:** `defaults` < `<home>/.env` < `./.env` (projeto) < variáveis de ambiente. A leitura é feita por `src/config/loadConfig.ts` e a resolução de caminhos por `src/config/paths.ts`.

**Overrides individuais de path (env):** `PROFILE_INBOX_DIR`, `PROFILE_DRAFT_PATH`, `PROFILE_MASTER_PATH`, `PROFILE_COMPILED_PATH`, `PROFILE_HISTORY_DIR`, `JOBS_DB_PATH` — relativos também resolvem sob `<home>`.

**Canais de candidatura (env):** `EMAIL_ENABLED`, `EMAIL_DISPATCH_MODE`, `EMAIL_MAX_DAILY`, `EMAIL_MIN_SCORE_AUTO_SEND`, `EMAIL_SMTP_CREDENTIAL_REF`, `EMAIL_COOLDOWN_DAYS`, `EMAIL_RETRY_MAX`, `EMAIL_RETRY_BACKOFF_MS`, `EMAIL_TEMPLATE_PATH`, `EMAIL_INCLUDE_SALARY` — ver doc 14. `WHATSAPP_ENABLED`, `WHATSAPP_MODE`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `WHATSAPP_TEMPLATE_PATH`, `WHATSAPP_COOLDOWN_DAYS`, `WHATSAPP_ATTACH_RESUME`, `WHATSAPP_RETRY_*` — ver doc 15. Credenciais SMTP ficam no cofre (`vault set`), não em env.

**Prospecção e réguas de aderência (env):** `JOB_TITLES` — títulos de cargo a procurar, separados por vírgula/ponto-e-vírgula (default: fullstack/backend dev); match aproximado, não precisa ser exato (ver `titleMatcher.ts`, doc 03 §5.5). `FIT_MIN_SCORE` — aderência mínima p/ seguir ao tailoring (default 75); `FIT_AUTO_SCORE` — aderência p/ envio 100% automático sem revisão (default 88). `LEXICAL_MIN_TERMS` — termos do perfil exigidos no texto da vaga no filtro da Camada 0 (default 1).

**Motor de descoberta (env):** `DISCOVERY_SOURCES` — allowlist de IDs de fontes (vazio = habilitadas por padrão: `remoteok,remotive,jobicy,arbeitnow,workingnomads,himalayas,hnhiring,hnjobs,ghfrontendbr,ghbackendbr,ghreactbr,weworkremotely,euremotejobs,trampos,programathor,getonbrd` — parâmetros de busca das APIs derivam da própria config (`geo`/`count`/paginação), sem env dedicado); `DISCOVERY_EXCLUDE_SOURCES` — remove IDs da execução; `DISCOVERY_REGIONS` — filtra o registro por região (`BR,LATAM,PT,EU,US,GLOBAL,ASIA,OCEANIA`); `DISCOVERY_WORK_MODELS` — restringe a `REMOTE`, `HYBRID`, `ONSITE`; `DISCOVERY_MAX_JOBS_PER_SOURCE` — teto por adapter (default 20); `DISCOVERY_MAX_JOBS_PER_RUN` — teto global por execução (metas altas de envio exigem teto proporcional — ex.: ~400 p/ 100 candidaturas); `DISCOVERY_MIN_JOBS_PER_RUN` — meta de candidaturas enviadas por run: abaixo dela o `run` expande a coleta (dobra o teto por fonte a cada rodada, até 3, excluindo URLs já vistas) e o relatório final sinaliza quando a meta fica aquém (default 0 = desligado); `DISCOVERY_CONCURRENCY` — fontes em paralelo (default 4); `DISCOVERY_PER_DOMAIN_DELAY_MS` — delay mínimo por domínio (default 1500); `DISCOVERY_USE_GENERIC_FALLBACK` — ativa extração de vagas via LLM em páginas HTML sem API/RSS (default true); `DISCOVERY_GENERIC_MODEL` — modelo do extrator (vazio = herda `AI_LOCAL_*`; hoje só provider `ollama`); `DISCOVERY_SEARCH_ENGINE` — `duckduckgo` | `bing` | `none` (busca orgânica; o outro engine vira fallback por query); `DISCOVERY_SEARCH_RESULT_LIMIT` — teto de resultados por query (default 30); `DISCOVERY_BROWSER_PROFILE_DIR`, `DISCOVERY_RESPECT_ROBOTS_TXT` — reservados (LinkedIn autenticado, robots.txt). `run` sem `--jobs-file` executa descoberta; `discover`/`scan` são comandos independentes. **Elegibilidade nacional:** `NATIONAL_WORK_MODELS` — modelos aceitos p/ vagas BR (default `REMOTE,HYBRID`); `ALLOWED_CITIES` — cidades permitidas p/ vagas híbridas (default `Recife,Jaboatão dos Guararapes`): híbrida que não cita nenhuma é rejeitada (`Cidade híbrida fora da lista permitida`).

**Pretensão salarial (env):** `SALARY_BRL`/`SALARY_USD` — pretensão default quando a vaga não declara nível (default 10000/4500). `SALARY_{BRL,USD}_{JUNIOR,PLENO,SENIOR}` — pretensão por nível detectado no título da vaga (`junior`/`pleno`/`senior`/`lead`/`staff`…). `SALARY_ADAPT_TO_RANGE=true` (default) — quando a faixa salarial da vaga paga **menos** que a pretensão, o sistema estipula o teto da faixa em vez de pedir acima; nunca infla acima da pretensão base. Ver `salaryResolver.ts`.

**Embeddings semânticos (env):** `AI_EMBEDDINGS_ENABLED=true` ativa a camada probabilística: `OLLAMA_EMBED_MODEL` (default `nomic-embed-text`) via `/api/embed` do Ollama. Alimenta dois recursos: o RAG do perfil no tailoring (`retrieveHybrid`, fusão léxico+semântico por RRF) e o match semântico de `JOB_TITLES` (fallback quando o determinístico não casa — cosine ≥ 0.72). `false`/ausente → ambos operam só no determinístico, custo zero.

```powershell
ollama pull nomic-embed-text                          # uma vez — ~270 MB
career config set AI_EMBEDDINGS_ENABLED true          # grava no .env do home

# aquece o modelo e valida o endpoint (resposta: {"embeddings": [[...]]} )
curl.exe http://localhost:11434/api/embed -d '{\"model\": \"nomic-embed-text\", \"input\": \"warmup\", \"keep_alive\": -1}'
```

> **Nota:** modelos de embedding não respondem em `/api/generate` — o endpoint correto é `/api/embed`.

**Configuração pela própria CLI** — sem editar arquivos na mão:

```powershell
career config init                        # cria <home>/, subpastas e .env template
career config path                        # mostra home e arquivo de config
career config set AI_SMART_PROVIDER groq  # grava no <home>/.env
career config get AI_LOCAL_MODEL          # valor efetivo (avisa se .env local sombreia)
career config unset AI_LOCAL_MODEL
career config check                     # preflight: testa endpoint+modelo dos 3 tiers
```

**Preflight + fallback de IA** — antes de qualquer comando que use LLM (`import`, `run`), o CLI testa endpoint+modelo do(s) tier(s) usado(s) e mostra `OK`/`FALHOU — motivo`. Em falha, o routing `fallback` do tier é oferecido: no shell interativo pergunta `[s/N]`; comando direto falha com dica. Gramática de `AI_<TIER>_FALLBACK`: `off` | `local`/`fast`/`smart` | `<provider>:<modelo>` — default da spec `local→fast`, `smart→fast`, `fast→off`. `AI_FALLBACK_ENABLED=false` desliga todos; `AI_PREFLIGHT_ENABLED=false` pula os testes; `AI_PREFLIGHT_TIMEOUT_MS=8000` por probe.

## 12. Fluxo Completo Atualizado

```text
[ Config: target = 'INTERNATIONAL' | mode = 'FULL_AUTO' ]
                           │
                           ▼
[ dorkBuilder.ts ] ──► Busca vagas em portais globais (EN)
                           │
                           ▼
[ Deduplicação SQLite + eligibilityGuard.ts ]
  (Descarta vagas já aplicadas ou que exigem "US Citizen Only")
                           │
                           ▼
[ triageAgent.ts (Camada 1 IA) ] ──► Calcula Fit Score real com seu CV
                           │
         ┌─────────────────┴─────────────────┐
         ▼ (Score < 88%)                     ▼ (Score >= 88% - Match Perfeito)
[ Fila SEMI_AUTO (Revisão) ]        [ Skill: international-remote + fullstack-ts ]
                                                     │
                                                     ▼
                                    [ Gera PDF em Inglês + Preenche Formulário ]
                                                     │
                                                     ▼
                                    [ Clica em "Submit" Automaticamente ]
                                                     │
                                                     ▼
                                    [ Grava no SQLite (status: APPLIED) ]
```

**Resumo:** Modos de Execução Configuráveis (FULL_AUTO vs. SEMI_AUTO) com Match Threshold (régua de precisão estrita para o sistema só aplicar automaticamente em vagas com altíssima aderência ao currículo), combinados ao Módulo de Escopo Geográfico (`src/geo/`) para filtrar, direcionar e adaptar candidaturas entre Mercado Nacional (Brasil), Internacional (Global/USD) ou Híbrido.

---

« [Anterior: Escopo Geográfico](08-escopo-geografico.md) | [Índice](README.md) | [Próximo: Confiabilidade →](10-confiabilidade.md)
