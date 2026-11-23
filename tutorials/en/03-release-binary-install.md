# Tutorial 03 — Install from release binaries

Download a package with a single executable plus external resources. No Node.js or npm is required.

## Download

Open the **[Releases](https://github.com/jhony2488/career-facilitator/releases)** tab in the GitHub repository and pick the **ZIP** for your system (recommended — ships complete):

| System                | Package                  |
| --------------------- | ------------------------ |
| Windows               | `career-windows-x64.zip` |
| macOS (Apple Silicon) | `career-macos-arm64.zip` |
| macOS (Intel)         | `career-macos-x64.zip`   |
| Linux                 | `career-linux-x64.zip`   |

Inside the ZIP:

```
career-<os>-<arch>/
├── career.exe | career        # single executable (Node SEA)
├── career-runtime/            # external modules + Chromium + tessdata (OCR)
├── skills/                    # dynamic skills library
└── .env.example               # reference for every configuration
```

> There is also the standalone binary (`career-<os>-<arch>[.exe]`) if you only want the executable — afterwards `career runtime setup` downloads `career-runtime-<os>-<arch>.tar.gz` and completes the resources (see section below).

## Windows

1. Download `career-windows-x64.zip` and unzip it, e.g. to `C:\Tools\CareerFacilator`.
2. Run it for the first time:

```powershell
C:\Tools\CareerFacilator\career-windows-x64\career.exe status
```

Windows SmartScreen may warn that the binary is unsigned. Click **More info** → **Run anyway**. The same can happen with the Chromium inside `career-runtime` on stricter antivirus — it is the official Playwright browser and is safe to allow.

## macOS

Apple Silicon (`arm64`) or Intel (`x64`):

```bash
unzip career-macos-arm64.zip
cd career-macos-arm64
xattr -dr com.apple.quarantine .        # frees exe + Chromium (Gatekeeper)
./career status
```

`xattr -dr` removes the quarantine flag **for the whole folder** — also needed for the Chromium inside `career-runtime/`.

## Linux

```bash
unzip career-linux-x64.zip
cd career-linux-x64
chmod +x career
./career status
```

The runtime Chromium may need system libraries — on the first web-form run, install the equivalent of `npx playwright install-deps chromium` (e.g. `libatk1.0-0`, `libnss3`, `libcups2`, `libxkbcommon0` on Debian/Ubuntu).

## Standalone binary + `runtime setup`

If you prefer just the executable (`career-<os>-<arch>[.exe]`):

```powershell
career.exe runtime status   # diagnostics of what is missing
career.exe runtime setup    # downloads career-runtime-<os>-<arch>.tar.gz from the release and extracts beside it
```

Without the runtime, the binary still runs API/RSS discovery, triage, e-mail, WhatsApp and the review queue — web forms, authenticated LinkedIn, text-layer PDF parsing and post-image OCR only activate once `career-runtime/` is present.

## Initialize configuration

```powershell
career.exe config init     # Windows
./career config init       # macOS / Linux
```

This creates `~/.careerfacilator/` with `.env` and the data folders.

## Portable mode (data next to the executable)

Create a `.env` file in the same folder as the executable with:

```dotenv
CAREER_HOME=.
```

Then `jobs.sqlite`, `profile.draft.md`, `storage/` and the exe-folder `.env` itself keep everything in the same directory — **the `.env` in the executable's folder wins over the working-directory `.env`** (below only real environment variables), and the relative `CAREER_HOME` anchors on the binary's folder even when invoked from another cwd.

## What works with the full runtime

- Web forms (Chromium autofill) — same as the source install
- Authenticated sources (`render: true`, LinkedIn/Gupy with login) and `career login`
- Text-layer PDF parsing via `pdf-parse`
- OCR for post images (tesseract `por`+`eng`, offline — `career-runtime/tessdata`)
- Skills library in `skills/` next to the exe

## Next step

Set up the AI: [04 — Setting up Ollama](04-setting-up-ollama.md) or [05 — Remote LLMs](05-setting-up-remote-llms.md).
Full execution and configuration reference for the executable: [08 — Release executable](08-release-executable.md).
