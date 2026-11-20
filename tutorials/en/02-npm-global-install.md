# Tutorial 02 — Global npm install

Use this mode to run `career` from any folder without opening the repository.

## Option A — `npm link` (from the repo)

Ideal to test local changes globally.

```powershell
cd career-facilitator-ts
npm link
```

## Option B — `npm install -g` (when published)

```powershell
npm install -g career-facilitator-ts
```

> This repository's `package.json` is marked `private`, so `npm install -g` only works after publishing to the npm registry. For development, use `npm link`.

## Check the install

```powershell
career --version
career status
```

## Initialize the data directory

```powershell
career config init
```

This creates `~/.careerfacilator/` with subfolders and a global `.env`.

## See where config is stored

```powershell
career config path
```

Expected output:

```text
Home:  C:\Users\<your-user>\.careerfacilator
Env:   C:\Users\<your-user>\.careerfacilator\.env
```

## Configure via the CLI

```powershell
career config set AI_LOCAL_PROVIDER ollama
career config set AI_LOCAL_MODEL llama3.2:3b
career config set OLLAMA_BASE_URL http://localhost:11434
career config get AI_LOCAL_MODEL
```

Everything is written to `<home>/.env`.

## Configuration precedence

The final config merges:

1. Code defaults
2. `<home>/.careerfacilator/.env`
3. `.env` in the current working directory (cwd)
4. Process environment variables

So you can place a `.env` with `CAREER_HOME=.` in any project folder and use local data whenever you want.

## Next step

Set up the AI: [04 — Setting up Ollama](04-setting-up-ollama.md) or [05 — Remote LLMs](05-setting-up-remote-llms.md).
