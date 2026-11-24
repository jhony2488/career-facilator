# 16. Graphical Interface — Local Dashboard + Desktop App

**Document 16 of the CareerFacilator AI specification.**

The graphical interface is a **local server embedded in the binary itself** (`career ui`) — the same application serves two clients: the browser's app-mode window (Edge/Chrome `--app=`) and the native window of the Tauri desktop app (`career-ui-<os>-<arch>`). The CLI keeps working exactly as before; the UI is a visual layer on top of the same commands, services, and files — **designed for devs and non-devs alike**: Home ships a "Getting started" guide (import résumé → configure AI → search jobs), actions have plain names and translated statuses, and technical material stays collapsed under "Advanced"/"Technical details".

## 16.1 Architecture

```
career ui ──► node:http on 127.0.0.1:<free port>
              │  session token (?token= / X-UI-Token — timing-safe)
              ├── /                → static assets (src/ui/public — disk in dev, sea asset in exe)
              ├── /api/*           → in-process structured reads (env, jobs, vault, profile, runtime)
              └── /api/tasks/*     → subprocess of the binary itself (stdout→SSE, feedable stdin)

career-ui-<os>-<arch> (Tauri 2)
              └── native webview ──► spawns sidecar `career serve --port 0 --no-open`
                                     → URL captured from stdout → kill-on-exit
```

- **`src/ui/server.ts`** — `createServer` bound to `127.0.0.1` only. No external bind: no other machine on the network can reach the UI.
- **`src/ui/auth.ts`** — random 48-hex token per session. Every `/api/` route requires `X-UI-Token` or `?token=` — arbitrary local pages cannot call the API (protects vault/writes against malicious JS on another local site).
- **`src/ui/readUiAsset.ts`** — dev reads `src/ui/public/` from disk; in the SEA binary uses `sea.getAsset('ui/<rel>')` (assets registered by `bundle.mjs` in `sea-config.json`).
- **`src/ui/tasks.ts`** — commands run as a **subprocess of the binary itself** (`process.execPath` in SEA; `node --import tsx src/cli/index.ts` in dev): stdout/stderr stream over SSE to the Terminal tab, stdin can be fed (interactive prompts of `review`, `vault set`, `login`), with a kill button. This guarantees byte-for-byte parity with the CLI without duplicating `cli/index.ts` logic.
- **`desktop/`** — minimal Tauri 2 shell: `externalBin` = `career-<target-triple>`, `resources` = `career-runtime/` + `skills/`; `main.rs` launches `serve --port 0 --no-open`, reads the URL from stdout and creates a `WebviewWindow` pointed at it, with sidecar kill-on-exit.

## 16.2 Local API

| Route                                                    | Purpose |
| -------------------------------------------------------- | ------- |
| `GET /api/meta`                                          | version, SEA/dev mode, home, dbPath, platform |
| `GET /api/env` · `PUT|DELETE /api/env/:key`              | effective env with **per-key source** (home/cwd/exe/process) and **masked secrets**; writes always go to `<home>/.env` via `envFile.ts` (same semantics as `config set`) |
| `GET /api/runtime`                                       | runtime sidecar: resolved dir, node_modules, browsers, tessdata, skills, playwright loadable |
| `GET /api/status`                                        | status counts in `jobs.sqlite` |
| `GET /api/jobs?status&q&limit` · `GET /api/jobs/queue`   | filterable list; queue = `NEEDS_HUMAN_INPUT` + `READY_TO_REVIEW` + WhatsApp queue |
| `POST /api/jobs/:id/status` · `POST /api/jobs/:id/remove`| same semantics as `mark`/`remove` (applied\|email\|whatsapp\|skipped\|failed\|rejected\|interview\|assessment) |
| `POST /api/tasks {argv}` · `GET /api/tasks/:id/events`   | starts subprocess; SSE with buffer replay + `done` |
| `POST /api/tasks/:id/input` · `POST /api/tasks/:id/kill` | writes to stdin; kills the process |
| `GET|PUT|DELETE /api/vault[/:ref]`                       | **refs only — never secrets**; writes encrypt via `FileCredentialVault` (same vault as CLI) |
| `GET|PUT /api/profile` · `POST /api/profile/import`      | master.md + draft; PUT writes and recompiles `profile.master.json`; import drops a PDF into `profile_inbox/` |

**Human-in-the-loop preserved:** the UI does not bypass any gate — `run`, `review`, `retry` run as subprocesses of the CLI itself, so `SEMI_AUTO`, escalations and interactive prompts still require the same human decision (via task stdin or the mark buttons that persist the same status as `mark`).

## 16.3 Commands

```powershell
career ui                    # server + app-mode window (Edge/Chrome --app=; fallback to regular tab)
career ui --port 8080        # fixed port
career serve --no-open       # server only — used by the desktop app
```

The same commands work in the standalone binary and the global npm install; in portable mode (`CAREER_HOME=.` next to the exe) data and config live beside the binary, and the tokenized URL is printed to the console so you can open it manually in another browser/profile.

## 16.4 Frontend

`src/ui/public/` — vanilla HTML+JS+CSS (no build step): **Dashboard** (meta + counts + tasks), **Configuration** (env vars by source, edit/remove, masked secrets), **Jobs** (status filter + search + actions), **Queue** (human decisions + WhatsApp), **Vault** (refs + JSON form), **Profile** (master.md view/edit + PDF import), **Runtime** (diagnostics + `runtime setup`) and **Terminal** (command presets + SSE console + stdin + kill). PT-BR/EN via `i18n/pt.json` and `i18n/en.json` with a header selector.

## 16.5 Distribution

| Artifact | Contents |
| -------- | -------- |
| `career-ui-<os>-<arch>.exe` (NSIS) | Windows — desktop app with embedded sidecar+runtime |
| `career-ui-<os>-<arch>.dmg` | macOS arm64 and x64 |
| `career-ui-<os>-<arch>.AppImage` | Linux |

The `desktop` job in `release.yml` installs the Rust toolchain per OS (`dtolnay/rust-toolchain` + `webkit2gtk` on Linux), downloads the zip from the `build` job, stages via `scripts/build-desktop.mjs --from <pkg>` (renames the exe to the target triple expected by `externalBin`) and runs `tauri build`. Target host requirements: WebView2 on Windows (installer bootstraps it), WebKit on Linux (AppImage needs `libwebkit2gtk-4.1` installed on the system).

The CLI package (`career-<os>-<arch>.zip` + `career-runtime-*.tar.gz`) is still produced by the `build` job but is now an intermediate artifact — no longer published to the release, it only feeds the desktop sidecar.

**CLI inside the UI package:** the embedded sidecar IS the full `career` binary — and installing the desktop package gives you a ready `career` command in the terminal: on first launch the app writes a shim onto the user's PATH (`desktop/src-tauri/src/cli_shim.rs` — `career.cmd` in `%LOCALAPPDATA%\Microsoft\WindowsApps` on Windows; `/opt/homebrew/bin` or `/usr/local/bin` on macOS, with an admin fallback; `~/.local/bin/career` on Linux, pointing at the AppImage in `--career-cli` mode, which runs the sidecar as a passthrough with no window). The shim injects `CAREER_RUNTIME` for the bundled resources and is rewritten on every launch (self-heals if the app moves); the exact binary path also shows on the dashboard under "CLI binary". Window and terminal share `CAREER_HOME`, vault and `jobs.sqlite` — one set of data, interchangeable.

## 16.6 Tests

- Unit: token/timing-safe, env masking + source, `readUiAsset` fallback, task policy (blocks `ui`/`serve`/`repl`, real `status` spawn).
- Integration (`__tests__/integration/ui-server.test.ts`): real server on an ephemeral port + temporary `CAREER_HOME` — static, i18n, 401 without token, meta, env roundtrip, vault without secrets, SSE task.

---

« [Previous: WhatsApp Application](15-whatsapp-application.md) | [Index](README.md)
