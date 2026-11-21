# Especificações BDD — CareerFacilator AI

Cenários comportamentais em Gherkin (`# language: pt`) cobrindo todos os módulos do sistema descritos em [`../docs/pt-BR/`](../docs/pt-BR/README.md). Estes arquivos especificam **o quê** o sistema deve fazer (comportamento observável), não **como** implementar.

## Índice

| # | Arquivo | Módulo / Capacidade |
|---|---------|---------------------|
| 01 | [01-discovery.feature](01-discovery.feature) | Descoberta de vagas (APIs/RSS, portais ATS, fallback assistido, busca, LinkedIn) |
| 02 | [02-deduplicacao.feature](02-deduplicacao.feature) | Deduplicação em 3 níveis antes de qualquer chamada de IA |
| 03 | [03-triagem-fit-score.feature](03-triagem-fit-score.feature) | Funil de triagem, Fit Score ponderado e dealbreakers |
| 04 | [04-skills-dinamicas.feature](04-skills-dinamicas.feature) | Seleção e injeção de skills sob demanda |
| 05 | [05-geracao-curriculo.feature](05-geracao-curriculo.feature) | Currículo adaptado, PDF ATS e respostas dissertativas |
| 06 | [06-autofill-formulario.feature](06-autofill-formulario.feature) | Preenchimento híbrido e formulários multi-etapas |
| 07 | [07-modos-candidatura.feature](07-modos-candidatura.feature) | FULL_AUTO, SEMI_AUTO, HYBRID_THRESHOLD e travas de segurança |
| 08 | [08-escopo-geografico.feature](08-escopo-geografico.feature) | Mercado NATIONAL / INTERNATIONAL / BOTH |
| 09 | [09-escalonamento-humano.feature](09-escalonamento-humano.feature) | CAPTCHA, OTP e escalonamento para `NEEDS_HUMAN_INPUT` |
| 10 | [10-candidatura-email.feature](10-candidatura-email.feature) | Fallback de candidatura por e-mail |
| 11 | [11-sessao-rate-limit.feature](11-sessao-rate-limit.feature) | Cofre de sessões e fila com jitter |
| 12 | [12-tracking-e-dry-run.feature](12-tracking-e-dry-run.feature) | Feedback loop pós-candidatura, marcação manual de status e modo de simulação |
| 13 | [13-ingestao-de-perfil.feature](13-ingestao-de-perfil.feature) | Ingestão de currículos em PDF, rascunho com revisão humana e perfil-mestre |
| 15 | [15-candidatura-whatsapp.feature](15-candidatura-whatsapp.feature) | Candidatura por número de WhatsApp — fila manual ou Evolution API |

## Documentos auxiliares

- [DECISOES.md](DECISOES.md) — Pontos de ambiguidade e decisões pendentes consolidados.

## Convenções

- **Idioma:** Português (`# language: pt`). Valores de status, modos e configurações permanecem em inglês por serem identificadores (`APPLIED`, `FULL_AUTO`, `minScoreForFullAuto`).
- **Estrutura:** `Funcionalidade:` + `Contexto:` (pré-condições comuns) + `Cenário:` / `Esquema do Cenário:` com `Exemplos:`.
- **Atomicidade:** cada cenário verifica um único comportamento (`Dado` estado inicial → `Quando` gatilho → `Então` resultado observável).
- **Sem detalhes técnicos:** nenhum seletor CSS, SQL, nome de função ou estrutura interna aparece nos passos — apenas intenção e estado observável. Nomes de arquivos/módulos podem aparecer na descrição da `Funcionalidade:` como referência documental.
- **Determinismo:** cenários que dependem de IA (ex: Fit Score) fixam a entrada relevante no `Dado` e verificam o comportamento resultante, nunca a saída bruta do modelo.
- **Ambiguidades:** lacunas de requisito estão comentadas (`# Ambiguidade:`) ao final de cada arquivo e consolidadas em `DECISOES.md`.
