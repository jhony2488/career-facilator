# 10. Módulo de Escopo Geográfico e Mercado (`src/geo/`)

Este módulo controla onde o sistema vai buscar vagas, como ele filtra restrições de visto/fuso horário e qual idioma/moeda será usado no currículo e nas respostas.

## 10.1. Estrutura de Diretórios

```text
career-facilitator-ts/
└── src/
    └── geo/
        ├── geoConfig.ts         # Configuração ativa: 'NATIONAL' | 'INTERNATIONAL' | 'BOTH'
        ├── dorkBuilder.ts       # Gera queries de busca específicas por mercado e idioma
        ├── eligibilityGuard.ts  # Filtra restrições de visto, fuso horário e contrato (CLT/PJ/B2B)
        └── localeAdapter.ts     # Alterna idioma do CV (PT-BR vs. EN-US) e pretensão salarial
```

## 10.2. Comportamento por Modo de Mercado

| Critério | Modo NATIONAL (Brasil) | Modo INTERNATIONAL (Gringa / Global) |
|----------|------------------------|--------------------------------------|
| **Fontes & Dorks** | Gupy, LinkedIn Brasil, GeekHunter, ProgramaThor, Greenhouse/Lever com filtro "Brasil" ou "LATAM". | Greenhouse, Lever, Ashby, Wellfound, RemoteOK, Y Combinator, LinkedIn Global ("Remote" / "LATAM" / "Worldwide"). |
| **Filtro de Elegibilidade** (`eligibilityGuard.ts`) | Valida modelo de contratação (CLT ou PJ), cidade/estado (se híbrido) ou remoto nacional. | Bloqueia vagas com "US Citizens Only", "W2 only" ou "Security Clearance". Prioriza vagas com "LATAM", "Async", "Contractor / B2B". |
| **Idioma do Currículo & Respostas** | Gera PDF e preenche formulários em Português (PT-BR), mantendo termos técnicos em inglês. | Ativa automaticamente a skill `international-remote`, traduz e adapta o PDF e as respostas para Inglês (EN-US). |
| **Pretensão Salarial** | Calcula e preenche faixa em BRL (R$) conforme regime CLT/PJ. | Converte e preenche faixa anual/mensal em USD ($) padrão mercado internacional. |

## 10.3. Critérios de Elegibilidade Refinados

- **`MARKET_SCOPE` (target):** `NATIONAL|INTERNATIONAL|BOTH` (default `BOTH`) é o gate de escopo da candidatura — vaga detectada no escopo desligado é recusada como `SKIPPED` antes de qualquer outra regra (`MARKET_SCOPE=NATIONAL` recusa vagas internacionais mesmo vinda de fonte GLOBAL). **Atenção:** `DISCOVERY_REGIONS` filtra apenas quais *fontes* rodam (fontes `GLOBAL` passam sempre) — não restringe a geografia da *vaga*.
- **`AMERICAS_TIMEZONE`:** corresponde à faixa fixa **UTC-8 a UTC-3** (Pacífico a Brasília). Vagas que declaram fuso fora dessa faixa não são priorizadas como compatíveis com as Américas.
- **Vaga sem região nem modelo declarados:** considerada **elegível**, mas recebe flag de revisão — nunca é enviada automaticamente, mesmo com Fit Score acima do limiar de `FULL_AUTO`.

---

« [Anterior: Modos de Candidatura](07-modos-de-candidatura.md) | [Índice](README.md) | [Próximo: Configuração →](09-configuracao.md)
