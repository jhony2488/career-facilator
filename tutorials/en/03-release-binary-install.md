# Tutorial 03 — Install from the release (desktop app + CLI)

Download one installer that delivers **both**: the native-window application and the `career` command ready in your terminal — both use the same data and work together (the Git model: `git` + `git-gui`). No Node.js or npm is required.

## Download

Open the **[Releases](https://github.com/jhony2488/career-facilitator/releases)** tab in the GitHub repository and pick the installer for your system:

| System                | Package                        |
| --------------------- | ------------------------------ |
| Windows               | `career-ui-windows-x64.exe`    |
| macOS (Apple Silicon) | `career-ui-macos-arm64.dmg`    |
| macOS (Intel)         | `career-ui-macos-x64.dmg`      |
| Linux                 | `career-ui-linux-x64.AppImage` |

Inside each package, already bundled:

```
CareerFacilator AI
├── career-ui                  # desktop app (native window)
├── career-<target-triple>     # the full CLI (embedded sidecar)
├── career-runtime/            # external modules + Chromium + tessdata (OCR)
└── skills/                    # dynamic skills library
```

## Windows

1. Download `career-ui-windows-x64.exe` and run it — the NSIS installer is per-user, no admin needed.
2. SmartScreen may warn the binary is unsigned: **More info** → **Run anyway**.
3. Open the app from the Start menu (or the created shortcut).

On first launch the app writes `career.cmd` into `%LOCALAPPDATA%\Microsoft\WindowsApps` — a folder already on the user PATH. **Open a new terminal** and the `career` command already works:

```powershell
career status
career discover
career ui          # same dashboard as the window, in the browser
```

## macOS

1. Download the `.dmg` for your chip, open it and drag **CareerFacilator AI** to `/Applications`.
2. Open the app — if Gatekeeper blocks it: `xattr -dr com.apple.quarantine "/Applications/CareerFacilator AI.app"`.

On first launch the app writes a `career` shim into `/opt/homebrew/bin` (when homebrew exists) or `/usr/local/bin`. If neither is writable, macOS asks for your password once to install the shim. After that, in a new terminal:

```bash
career status
career discover
```

> If you declined the password prompt, the app won't ask again (marker `~/.careerfacilator/cli-shim-declined` — delete it to retry, or create the symlink manually).

## Linux

1. Download `career-ui-linux-x64.AppImage`, `chmod +x` and run it once.

```bash
chmod +x career-ui-linux-x64.AppImage
./career-ui-linux-x64.AppImage     # opens the window and registers the CLI
```

On first run the app writes `~/.local/bin/career` — a shim that calls the AppImage itself in CLI mode. If `~/.local/bin` is on your PATH (default on current distros), the `career` command works in a new terminal right away.

The bundled Chromium may need system libraries — on the first web-form run, install the equivalent of `npx playwright install-deps chromium` (e.g. `libatk1.0-0`, `libnss3`, `libcups2`, `libxkbcommon0` on Debian/Ubuntu).

## App and CLI working together

- The `career` command is the **same embedded binary** as the app — not a separate copy.
- Window and terminal share `CAREER_HOME`, vault and `jobs.sqlite`: what you do in the UI shows up in `career status` in the terminal and vice versa.
- The shim already injects `CAREER_RUNTIME` (and `CAREER_SKILLS`) pointing at the bundled resources — web autofill, OCR and PDF parsing work from the terminal just like in the window.
- The shim is rewritten on every app launch: if you move the AppImage or `.app`, the command self-heals on the next run.

## Initialize configuration

```powershell
career config init     # creates ~/.careerfacilator/ with .env and data folders
career config path     # shows where the effective .env lives
```

Configuration can also be done inside the app's window (config tab — the values are the same as `config set`).

## What works out of the box

- Full graphical interface (native window) + every CLI command
- Web forms (Chromium autofill) — same engine as the source install
- Authenticated sources (`render: true`, LinkedIn/Gupy with login) and `career login`
- Text-layer PDF parsing via `pdf-parse`
- OCR for post images (tesseract `por`+`eng`, offline — `career-runtime/tessdata`)
- Bundled skills library

## Next step

Set up the AI: [04 — Setting up Ollama](04-setting-up-ollama.md) or [05 — Remote LLMs](05-setting-up-remote-llms.md).
Full execution and configuration reference: [08 — Release executable](08-release-executable.md).
The graphical interface in detail: [09 — Graphical interface](09-graphical-interface.md).
