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
}

export const defaultCareerOpsConfig: CareerOpsConfig = {
  execution: {
    mode: 'HYBRID_THRESHOLD',
    minScoreForTailoring: 75,
    minScoreForFullAuto: 88,
    maxDailyApplications: 15,
    companyCooldownDays: 30,
    maxJobsPerRun: 100,
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
};
```

## 11.1. Diretório de dados e CLI global

Os caminhos relativos de `profile` e `storage/` (incluindo `jobs.sqlite`) resolvem sob o **diretório de dados**:

- `CAREER_HOME` — override explícito do diretório;
- `~/.careerfacilator` — default quando a CLI roda instalada globalmente (`npm link`/`npm i -g`, binário `career`/`career-facilitator` via `bin/career.cjs`);
- Em dev no repo, o `.env` local fixa `CAREER_HOME=.`, mantendo os dados na pasta do projeto.

**Precedência de configuração:** `defaults` < `<home>/.env` < `./.env` (projeto) < variáveis de ambiente. A leitura é feita por `src/config/loadConfig.ts` e a resolução de caminhos por `src/config/paths.ts`.

**Overrides individuais de path (env):** `PROFILE_INBOX_DIR`, `PROFILE_DRAFT_PATH`, `PROFILE_MASTER_PATH`, `PROFILE_COMPILED_PATH`, `PROFILE_HISTORY_DIR`, `JOBS_DB_PATH` — relativos também resolvem sob `<home>`.

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
