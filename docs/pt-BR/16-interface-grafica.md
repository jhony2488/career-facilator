# 16. Interface Gráfica — Dashboard Web + App Desktop

**Documento 16 da especificação CareerFacilator AI.**

A interface gráfica é um **servidor local embutido no próprio binário** (`career ui`) — a mesma aplicação serve dois clientes: a janela app-mode do navegador (Edge/Chrome `--app=`) e a janela nativa do app desktop Tauri (`career-ui-<os>-<arch>`). O CLI segue funcionando exatamente como antes; a UI é uma camada visual sobre os mesmos comandos, serviços e arquivos — **projetada para devs e não-devs**: o Início traz o guia "Primeiros passos" (importar CV → configurar IA → buscar vagas), as ações têm nomes claros e estados traduzidos, e o material técnico fica colapsado em "Avançado"/"Detalhes técnicos".

## 16.1 Arquitetura

```
career ui ──► node:http em 127.0.0.1:<porta livre>
              │  token de sessão (?token= / X-UI-Token — timing-safe)
              ├── /                → assets estáticos (src/ui/public — disco em dev, sea asset no exe)
              ├── /api/*           → leituras estruturadas in-process (env, jobs, vault, perfil, runtime)
              └── /api/tasks/*     → subprocesso do próprio binário (stdout→SSE, stdin alimentável)

career-ui-<os>-<arch> (Tauri 2)
              └── webview nativa ──► spawn do sidecar `career serve --port 0 --no-open`
                                     → URL capturada do stdout → kill-on-exit
```

- **`src/ui/server.ts`** — `createServer` em `127.0.0.1` somente. Sem bind externo: nenhuma máquina da rede acessa a UI.
- **`src/ui/auth.ts`** — token aleatório de 48 hex por sessão. Toda rota `/api/` exige `X-UI-Token` ou `?token=` — páginas locais arbitrárias não conseguem chamar a API (protege cofre/escritas contra JS malicioso em outro site local).
- **`src/ui/readUiAsset.ts`** — dev lê `src/ui/public/` do disco; no binário SEA usa `sea.getAsset('ui/<rel>')` (assets registrados pelo `bundle.mjs` no `sea-config.json`).
- **`src/ui/tasks.ts`** — comandos rodam como **subprocesso do próprio binário** (`process.execPath` no SEA; `node --import tsx src/cli/index.ts` em dev): stdout/stderr vão por SSE para a aba Terminal, stdin pode ser alimentado (perguntas interativas do `review`, `vault set`, `login`), e há botão de encerrar. Isso garante paridade byte-a-byte com o CLI sem duplicar a lógica do `cli/index.ts`.
- **`desktop/`** — shell Tauri 2 mínimo: `externalBin` = `career-<target-triple>`, `resources` = `career-runtime/` + `skills/`; `main.rs` sobe `serve --port 0 --no-open`, lê a URL do stdout e cria a `WebviewWindow` apontada para ela, com kill-on-exit do sidecar.

## 16.2 API local

| Rota                                                     | Função |
| -------------------------------------------------------- | ------ |
| `GET /api/meta`                                          | versão, modo SEA/dev, home, dbPath, plataforma |
| `GET /api/env` · `PUT|DELETE /api/env/:key`              | env efetivo com **fonte por chave** (home/cwd/exe/process) e **segredos mascarados**; escrita sempre no `<home>/.env` via `envFile.ts` (mesma semântica de `config set`) |
| `GET /api/runtime`                                       | runtime sidecar: dir resolvido, node_modules, browsers, tessdata, skills, playwright carregável |
| `GET /api/status`                                        | contagens por status no `jobs.sqlite` |
| `GET /api/jobs?status&q&limit` · `GET /api/jobs/queue`   | lista filtrável; fila = `NEEDS_HUMAN_INPUT` + `READY_TO_REVIEW` + fila WhatsApp |
| `POST /api/jobs/:id/status` · `POST /api/jobs/:id/remove`| mesma semântica de `mark`/`remove` (applied\|email\|whatsapp\|skipped\|failed\|rejected\|interview\|assessment) |
| `POST /api/tasks {argv}` · `GET /api/tasks/:id/events`   | inicia subprocesso; SSE com replay do buffer + `done` |
| `POST /api/tasks/:id/input` · `POST /api/tasks/:id/kill` | escreve no stdin; encerra o processo |
| `GET|PUT|DELETE /api/vault[/:ref]`                       | **só refs — nunca segredos**; escrita cifra via `FileCredentialVault` (mesmo cofre do CLI) |
| `GET|PUT /api/profile` · `POST /api/profile/import`      | master.md + rascunho; PUT grava e recompila `profile.master.json`; import grava PDF na `profile_inbox/` |

**Human-in-the-loop preservado:** a UI não contorna nenhum gate — `run`, `review`, `retry` rodam como subprocessos do próprio CLI, então `SEMI_AUTO`, escalonamentos e perguntas interativas continuam exigindo a mesma decisão humana (via stdin da task ou pelos botões de marcação que persistem o mesmo status do `mark`).

## 16.3 Comandos

```powershell
career ui                    # servidor + janela app-mode (Edge/Chrome --app=; fallback p/ aba comum)
career ui --port 8080        # porta fixa
career serve --no-open       # somente servidor — usado pelo app desktop
```

No binário standalone e na instalação npm global os mesmos comandos funcionam; no modo portátil (`CAREER_HOME=.` na pasta do exe) dados e config ficam ao lado do binário, e a URL com token é impressa no console para abrir manualmente em outro navegador/perfil.

## 16.4 Frontend

`src/ui/public/` — HTML+JS+CSS vanilla (sem build step): abas **Dashboard** (meta + contagens + tasks), **Configuração** (envs por fonte, edição/remoção, segredos mascarados), **Vagas** (filtro por status + busca + ações), **Fila** (decisões humanas + WhatsApp), **Cofre** (refs + formulário JSON), **Perfil** (master.md view/edit + importar PDF), **Runtime** (diagnóstico + `runtime setup`) e **Terminal** (presets de comando + console SSE + stdin + kill). Idiomas PT-BR/EN via `i18n/pt.json` e `i18n/en.json` com seletor no topo.

## 16.5 Distribuição

| Artefato | Conteúdo |
| -------- | -------- |
| `career-ui-<os>-<arch>.exe` (NSIS) | Windows — app desktop com sidecar+runtime embutidos |
| `career-ui-<os>-<arch>.dmg` | macOS arm64 e x64 |
| `career-ui-<os>-<arch>.AppImage` | Linux |

Um único job `build` por OS no `release.yml` faz tudo: toolchain Node + Rust (`dtolnay/rust-toolchain` + `webkit2gtk` no Linux), `npm run build:exe` + `build:runtime` (gera `dist/career-<os>-<arch>` + `dist/career-runtime/` + `dist/skills/`), smoke test do binário, staging via `scripts/build-desktop.mjs` (renomeia o exe para o target-triple esperado pelo `externalBin`) e `tauri build`. Requisitos do host alvo: WebView2 no Windows (o instalador faz bootstrap), WebKit no Linux (AppImage exige `libwebkit2gtk-4.1` instalado no sistema).

**CLI dentro do pacote UI:** o sidecar embutido É o binário `career` completo — e quem instala o pacote desktop ganha o comando `career` pronto no terminal: no 1º launch o app grava um shim no PATH do usuário (`desktop/src-tauri/src/cli_shim.rs` — `career.cmd` em `%LOCALAPPDATA%\Microsoft\WindowsApps` no Windows; `/opt/homebrew/bin` ou `/usr/local/bin` no macOS, com fallback admin; `~/.local/bin/career` no Linux, apontando p/ o AppImage no modo `--career-cli`, que executa o sidecar em passthrough sem janela). O shim injeta `CAREER_RUNTIME` p/ os recursos embutidos e é reescrito a cada launch (auto-corrige se o app mudar de lugar); o caminho exato do executável também aparece no dashboard, em "Binário do CLI". Janela e terminal compartilham `CAREER_HOME`, cofre e `jobs.sqlite` — dados únicos, intercambiáveis.

## 16.6 Testes

- Unit: token/timing-safe, mascaramento e fonte do env, `readUiAsset` fallback, política de tasks (bloqueio de `ui`/`serve`/`repl`, spawn real do `status`).
- Integration (`__tests__/integration/ui-server.test.ts`): servidor real em porta efêmera + `CAREER_HOME` temporário — static, i18n, 401 sem token, meta, env roundtrip, vault sem segredos, task com SSE.

---

« [Anterior: Candidatura por WhatsApp](15-candidatura-por-whatsapp.md) | [Índice](README.md)
