# Tutorial 02 — Instalação global pelo npm

Use este modo para rodar `career` de qualquer pasta, sem precisar abrir o repositório.

## Opção A — `npm link` (a partir do repo)

Ideal para testar alterações locais globalmente.

```powershell
cd career-facilitator-ts
npm link
```

## Opção B — `npm install -g` (quando publicado no npm)

```powershell
npm install -g career-facilitator-ts
```

> O `package.json` deste repositório está marcado como `private`, então `npm install -g` só funciona após publicação no registry. Para desenvolvimento, use `npm link`. Quando publicado, o npm será o canal **só-CLI** (sem app desktop nem `career-runtime` empacotado — browsers do Playwright via `npx playwright install`); quem quiser app + CLI num só pacote baixa o instalador do release ([tutorial 03](03-instalacao-binario-release.md)).

## Verifique a instalação

```powershell
career --version
career status
```

## Inicialize o diretório de dados

```powershell
career config init
```

Isso cria `~/.careerfacilator/` com as subpastas e um `.env` global.

## Veja onde a configuração está

```powershell
career config path
```

Saída esperada:

```text
Home:  C:\Users\<seu-usuario>\.careerfacilator
Env:   C:\Users\<seu-usuario>\.careerfacilator\.env
```

## Configure pela própria CLI

```powershell
career config set AI_LOCAL_PROVIDER ollama
career config set AI_LOCAL_MODEL llama3.2:3b
career config set OLLAMA_BASE_URL http://localhost:11434
career config get AI_LOCAL_MODEL
```

Tudo é gravado em `<home>/.env`.

## Precedência de configuração

A configuração final é a combinação de:

1. Valores padrão do código
2. `<home>/.careerfacilator/.env`
3. `.env` na pasta atual (cwd)
4. Variáveis de ambiente do processo

Então você pode colocar um `.env` em qualquer projeto com `CAREER_HOME=.` e usar dados locais quando quiser.

## Próximo passo

Configure a IA: [04 — Configurando Ollama](04-configurando-ollama.md) ou [05 — IAs remotas](05-configurando-ias-remotas.md).
