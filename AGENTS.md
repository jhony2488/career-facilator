# AGENTS.md — Guia para agentes de IA

## O que é este projeto

**CareerFacilator AI (TypeScript Edition)** — sistema autônomo de prospecção, triagem semântica, adaptação de currículos e candidatura assistida a vagas de emprego, com foco em otimização de custo de inferência (funil determinístico → modelos leves → modelos de raciocínio com prompt caching).

**Estado atual:** fase de especificação. Não há código-fonte ainda — apenas `docs/` (arquitetura) e `feature/` (cenários BDD). A implementação seguirá o roadmap em `docs/pt-BR/12-roadmap.md`.

## Onde encontrar as coisas

| Caminho | Conteúdo |
|---------|----------|
| `docs/pt-BR/` | Especificação de arquitetura (fonte da verdade, 13 docs numerados) |
| `docs/en/` | Mesma especificação traduzida para inglês |
| `feature/*.feature` | Cenários BDD em Gherkin PT (`# language: pt`), um por módulo |
| `feature/DECISOES.md` | Ambiguidades de requisito e decisões pendentes — **consultar antes de implementar** |

## Convenções do projeto

### Nomenclatura
- Produto: **CareerFacilator AI** (a spec antiga usava "CareerOps AI" — normalizado; identificadores de código da spec como `CareerOpsConfig`/`careerOps.config.ts` permanecem como no documento original)
- Diretório de código planejado: `career-facilitator-ts/src/` (ver `docs/pt-BR/02-arquitetura.md`)
- Extensões sempre `.ts` — a spec antiga usava `.kf` no módulo de e-mail (resquício de outro sistema, já normalizado)

### Documentação
- Docs em **PT-BR e EN** sempre em pares (`docs/pt-BR/NN-nome.md` ↔ `docs/en/NN-name.md`)
- Numeração de seção interna preserva os números originais da spec (ex: `05-skills` começa em "# 8.")
- Navegação « anterior / índice / próximo » ao fim de cada doc
- Ao alterar um doc PT-BR, atualizar o equivalente EN

### Specs BDD (`.feature`)
- `# language: pt` sempre; keywords `Funcionalidade`, `Contexto`, `Cenário`, `Esquema do Cenário`, `Exemplos`
- **Comportamental, não técnico:** proibido seletores CSS, SQL, nomes de função nos passos — apenas estado observável (status como `APPLIED`, `NEEDS_HUMAN_INPUT` ficam em inglês por serem identificadores)
- Cenários com IA fixam a entrada no `Dado` — nunca dependem da saída real do modelo
- Ambiguidades: comentário `# Ambiguidade:` ao fim do arquivo + consolidar em `feature/DECISOES.md`

### Conceitos-chave do domínio
- **Máquina de estados:** `DISCOVERED → TRIAGED → TAILORED → READY_TO_REVIEW → APPLIED` (+ `SKIPPED`, `APPLIED_VIA_EMAIL`, `NEEDS_HUMAN_INPUT`, `REJECTED`, `INTERVIEW`, `ASSESSMENT_INVITED`)
- **Modos de execução:** `FULL_AUTO` / `SEMI_AUTO` / `HYBRID_THRESHOLD` (régua: 75 para tailoring, 88 para auto-envio)
- **Escopo de mercado:** `NATIONAL` / `INTERNATIONAL` / `BOTH`
- **Skills dinâmicas:** `SKILL.md` + `keywords.json`, seleção determinística (máx. 2 por vaga)
- **Perfil-mestre:** `profile.master.md` editável é a fonte da verdade; `profile.master.json` é o artefato compilado usado no cache de prompt. Ingestão via `src/intake/` (ver `docs/pt-BR/13-ingestao-de-perfil.md`) — anti-fabricação: nada entra no perfil sem vir de documento do usuário ou de edição manual

## Stack planejada (quando implementar)

Node.js v22+ / TypeScript strict · Playwright + stealth · Vercel AI SDK + Zod · Drizzle + better-sqlite3 · Ollama (triagem local) + Groq/Gemini/Claude Haiku (nuvem com cache)

## Testes (`__tests__/`)

- Jest + ts-jest, 3 projects: `unit/`, `integration/`, `e2e/` — **27 suites** derivadas dos `.feature`
- Testes importam de `../src/` (ainda inexistente → não compilam; TDD intencional)
- **Contratos provisórios** das assinaturas de `src/`: `__tests__/helpers/contracts.ts` — atualizar lá antes de mudar testes em massa
- Mocks de deps externas em `__tests__/helpers/mocks.ts` — nunca importar playwright/nodemailer/SDKs nos testes
- Comandos: `npm run test:unit|test:integration|test:e2e` (após `npm install` + `src/` existir)

## Verificação

Não há build ainda. Para alterações em docs/specs/testes:

```powershell
# Resíduos proibidos (deve retornar 0 fora de identificadores de código)
# .kf, cite:, \ge, "CareerOps AI" na prosa

# Todo .feature deve começar com "# language: pt"
Select-String -Path feature\*.feature -Pattern '^# language: pt'

# Links relativos entre docs devem resolver
```

## Regras para agentes

1. **Antes de implementar qualquer módulo**, ler o doc correspondente em `docs/pt-BR/` e o `.feature` correspondente — e verificar `feature/DECISOES.md` por decisões pendentes daquele módulo.
2. **Não implementar código** a menos que explicitamente pedido — o projeto está em fase de especificação.
3. **Human-in-the-loop é requisito, não opção:** nenhum fluxo pode enviar candidatura sem respeitar o modo de execução configurado.
4. **Nunca commitar segredos** — credenciais SMTP/sessões vivem no cofre criptografado (ver `docs/pt-BR/10-confiabilidade.md`).
