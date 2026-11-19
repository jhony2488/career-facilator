# CareerFacilator AI (TypeScript Edition)

Sistema autônomo de prospecção, triagem semântica, adaptação de currículos e candidatura assistida com otimização de inferência.

> **Status:** fase de especificação — documentação de arquitetura e cenários BDD completos; implementação ainda não iniciada.

## O que é

O CareerFacilator AI automatiza o ciclo ponta a ponta de busca e candidatura a vagas (LinkedIn, Greenhouse, Lever, Gupy, Workday e portais próprios) operando sob um **Funil de Otimização de Inferência em 3 Camadas**:

| Camada | Função | Custo |
|--------|--------|-------|
| **0 — Determinística** | Limpeza de DOM, deduplicação, filtros léxicos, aderência TF-IDF/BM25 | Zero / 0ms |
| **1 — Modelos leves** | Fit Score + requisitos estruturados (Ollama local / Groq / Flash-Lite) | Baixo / rápido |
| **2 — Raciocínio + cache** | Currículo adaptado e Q&A apenas para vagas ≥ 75% (prompt caching) | Alto / preciso |

## Estrutura do repositório

```text
CareerFacilator/
├── docs/            # Especificação de arquitetura completa
│   ├── pt-BR/       # 12 documentos em português
│   └── en/          # 12 documentos em inglês
├── feature/         # Especificações BDD/Gherkin (12 .feature + DECISOES.md)
├── AGENTS.md        # Guia para agentes de IA trabalhando neste repo
└── README.md        # Este arquivo
```

## Documentação

- **[docs/README.md](docs/README.md)** — índice geral (PT-BR + EN)
- **[docs/pt-BR/README.md](docs/pt-BR/README.md)** — arquitetura, otimização de IA, skills dinâmicas, modos de candidatura, escopo geográfico, confiabilidade e candidatura por e-mail
- **[feature/README.md](feature/README.md)** — cenários BDD cobrindo todos os módulos
- **[feature/DECISOES.md](feature/DECISOES.md)** — ambiguidades e decisões pendentes

## Stack planejada (100% TypeScript)

Node.js v22+ · Playwright Stealth · Vercel AI SDK + Zod · Ollama/Groq/Gemini/Claude Haiku · SQLite (better-sqlite3 + Drizzle) · `@mozilla/readability` + `turndown` · `@react-pdf/renderer`

## Próximos passos

Ver [docs/pt-BR/12-roadmap.md](docs/pt-BR/12-roadmap.md) — Fase 1 começa com `domCleaner.ts` + `triageAgent.ts` + deduplicação.
