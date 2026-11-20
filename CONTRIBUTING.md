# Guia de Contribuição — CareerFacilator AI

_English version: [CONTRIBUTING.en.md](CONTRIBUTING.en.md)_

Obrigado por contribuir! Este documento define as regras de fluxo, estilo e qualidade do projeto.

## Fluxo de trabalho

1. **Fork + branch:** crie uma branch a partir de `main` com nome `feat/`, `fix/`, `docs/` ou `chore/` + descrição curta (ex.: `feat/triage-fallback`).
2. **TDD primeiro:** `__tests__/` é a spec executável — escreva/ajuste o teste antes da implementação.
3. **Antes de implementar um módulo**, leia o doc correspondente em `docs/pt-BR/` e o `.feature` em `feature/`, e verifique `feature/DECISOES.md`.
4. **Verifique localmente** antes de abrir PR:

```powershell
npm run lint        # ESLint
npm run format:check# Prettier
npx tsc --noEmit    # Typecheck
npm run test        # 36 suites Jest
```

## Regras de PR

### Tamanho: máximo de 20 arquivos por PR

PRs devem ser pequenos e revisáveis. A diretriz é de **até 20 arquivos alterados** (excluindo lockfiles) — verificada na revisão.

**Exceções justificadas** — permitido exceder o limite quando:

- A mudança é estrutural e indivisível (ex.: criação inicial de `src/`, migração de framework);
- É refatoração puramente mecânica (rename/reorganização) sem mudança de comportamento;
- É alteração gerada por ferramenta (lockfile, codegen).

Nesses casos, **explique no corpo do PR**: por que não pode ser dividido e como o revisor deve navegar (ordem de leitura, arquivos centrais).

### Conteúdo do PR

- Título no formato Conventional Commits (ex.: `feat(intake): extrai camada de texto do PDF`).
- Descrição com: **o que**, **por que**, **como testar** e referência a `.feature`/doc quando aplicável.
- Um assunto por PR — não misture feature + refactor + docs.

## Regras de commit (Conventional Commits)

Formato: `<tipo>(<escopo>): <descrição curta no imperativo>`

| Tipo | Uso |
|------|-----|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `docs` | Só documentação |
| `test` | Só testes |
| `refactor` | Mudança interna sem alterar comportamento |
| `perf` | Performance |
| `chore` | Build, deps, config |
| `style` | Formatação (sem lógica) |
| `ci` | Pipelines/CI |

Escopos sugeridos: `intake`, `ai`, `scraper`, `geo`, `skills`, `autofill`, `core`, `email`, `db`, `tracker`, `cli`, `config`.

Exemplos:

```text
feat(triage): adiciona fallback local→nuvem na falha do modelo
fix(repository): normaliza URL canônica removendo utm_*
docs(13): documenta seção de projetos open source
test(e2e): cobre deferimento por limite diário
```

Regras adicionais:

- Commits pequenos e atômicos — uma ideia por commit.
- Mensagem em **inglês** (código/docs de sistema) ou **português** se o repositório adotar PT — neste projeto usamos inglês nas mensagens.
- **Nunca commite segredos** — credenciais SMTP/sessões vivem no cofre AES-256-GCM, nunca no repositório.

## Estilo de código

- **TypeScript strict** — sem `any` implícito; tipos de domínio preferem `type`/`interface` exportados.
- **ESLint + Prettier** são a fonte da verdade de estilo: rode `npm run lint` e `npm run format` antes de commitar (ou configure format-on-save no editor com `.editorconfig`).
- **Injeção de dependências:** módulos nunca importam Playwright, SMTP ou SDKs de LLM diretamente em código testável — recebem por `deps`.
- **Anti-fabricação (doc 13):** nenhum dado do perfil do usuário pode ser inferido/inventado — campos ausentes ficam `NÃO_INFORMADO`/`null`.
- **Human-in-the-loop:** nenhum fluxo pode enviar candidatura sem respeitar o modo de execução configurado.
- **Descrições de teste em inglês:** `describe`/`it` e comentários dentro de `__tests__/` sempre em inglês (os cenários `.feature` de origem seguem em PT).

## Estrutura

- `docs/pt-BR/` + `docs/en/` — especificação (sempre em pares; alterou um, altere o outro)
- `feature/*.feature` — cenários BDD em Gherkin PT (`# language: pt`)
- `__tests__/` — suites Jest; contratos de `src/` em `helpers/contracts.ts`
- `src/` — implementação por módulo (ver `docs/pt-BR/02-arquitetura.md`)

## Como propor mudança na spec

Mudanças comportamentais começam na spec: ajuste o `.feature` e o doc correspondente, atualize `feature/DECISOES.md` se a decisão estiver pendente, e só então implemente.
