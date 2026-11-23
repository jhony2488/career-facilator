# Tutorial 09 — Graphical interface (dashboard + desktop app)

The graphical interface is a **local server embedded in the binary itself** — the same dashboard opens in the browser (`career ui`) or in the native window of the Tauri desktop app (`career-ui-<os>-<arch>`). The CLI keeps working exactly as before; the UI is a visual layer on top of the same commands, vault, and files.

## 1. Opening the interface

```powershell
career ui                    # starts the server + opens the browser
career ui --port 8080        # fixed port
career serve --no-open       # server only (used by the desktop app)
```

The server listens on `127.0.0.1` only and generates a random **session token** — the printed URL already includes it. When the process ends, the token dies with it.

## 2. Desktop app (separate install)

The release ships per-OS installers:

| Platform | File                              | Install                                        |
| -------- | --------------------------------- | ---------------------------------------------- |
| Windows  | `career-ui-windows-x64.exe`       | NSIS per-user (bootstraps WebView2 if missing) |
| macOS    | `career-ui-macos-{arm64,x64}.dmg` | Drag to Applications                           |
| Linux    | `career-ui-linux-x64.AppImage`    | `chmod +x` and run                             |

The app bundles the `career` binary and `career-runtime/` as internal resources — an install independent of the CLI package. On open, it starts the local server and connects the window automatically.

## 3. What each tab does

- **Dashboard** — version, mode (SEA/dev), data directory, status counts and recent tasks.
- **Configuration** — every effective env var with its source (home/cwd/exe/process). Secrets (`*_API_KEY`, passwords, tokens) are masked; click _edit_ and type the new value — written to the `CAREER_HOME` `.env` just like `career config set`.
- **Jobs** — status-filterable list + search; mark actions (applied, e-mail, whatsapp, skip, failed, rejected…) and delete — same effect as `mark`/`remove`.
- **Queue** — `NEEDS_HUMAN_INPUT` + `READY_TO_REVIEW` + WhatsApp queue, with decision buttons.
- **Vault** — refs only (never secrets); `ref` + JSON form → `vault set` equivalent, same encryption.
- **Profile** — `profile.master.md` view/edit (saves and recompiles the `.json`), PDF upload → `profile_inbox/`, `import --inbox` and `approve` buttons.
- **Runtime** — sidecar diagnostics (`node_modules`, browsers, tessdata, skills, playwright) + `runtime setup` button.
- **Terminal** — command presets (`discover`, `run`, `review`, `config check`…) with live output (SSE), stdin field for interactive prompts, and a kill button.

**Human-in-the-loop**: the UI does not bypass any gate — `run`/`review`/`retry` run the binary itself as a subprocess, so `SEMI_AUTO`, CAPTCHA and prompts still require your decision (via the task stdin field or the queue buttons).

## 4. Language and data modes

- **PT-BR / EN** selector in the header — preference saved in the browser.
- `CAREER_HOME=.` (portable) works: data and `.env` stay beside the exe.
- The token can be reopened manually — copy the printed URL into another browser/profile on the same machine.

## 5. Building the desktop app (development)

```powershell
npm run dist                 # exe + runtime + zip (prerequisite)
npm run build:desktop        # stage + tauri build (requires Rust toolchain)
npm run build:desktop:prep   # binaries staging only — no cargo
```

Local requirements: Rust (`rustup`), WebView2 (Windows), `libwebkit2gtk-4.1-dev` (Linux), Xcode CLT (macOS). Without local Rust, the build runs in CI (`release.yml`, `desktop` job).

---

« [Previous: Release executable](08-release-executable.md) | [Index](README.md)
