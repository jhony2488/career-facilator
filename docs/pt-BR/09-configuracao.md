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
