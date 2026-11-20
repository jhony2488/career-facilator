# Tutorial 03 — Install from release binaries

Download a single executable. No Node.js or npm is required.

## Download

Open the **Releases** tab in the GitHub repository and pick the file for your system:

| System                | File                     |
| --------------------- | ------------------------ |
| Windows               | `career-windows-x64.exe` |
| macOS (Apple Silicon) | `career-macos-arm64`     |
| Linux                 | `career-linux-x64`       |

## Windows

1. Download `career-windows-x64.exe`.
2. Move it to a folder, e.g. `C:\Tools\CareerFacilator`.
3. Run it for the first time:

```powershell
C:\Tools\CareerFacilator\career-windows-x64.exe status
```

Windows SmartScreen may warn that the file is unsigned. Click **More info** → **Run anyway**.

## macOS

1. Download `career-macos-arm64`.
2. In Terminal, inside the file folder:

```bash
chmod +x career-macos-arm64
xattr -d com.apple.quarantine career-macos-arm64
./career-macos-arm64 status
```

`xattr` removes the Gatekeeper quarantine flag for binaries downloaded from the internet.

## Linux

1. Download `career-linux-x64`.
2. In the terminal:

```bash
chmod +x career-linux-x64
./career-linux-x64 status
```

## Initialize configuration

```powershell
career-windows-x64.exe config init   # Windows
./career-macos-arm64 config init     # macOS
./career-linux-x64 config init      # Linux
```

This creates `~/.careerfacilator/` with `.env` and data folders.

## Portable mode (data next to the executable)

Create a `.env` file in the same folder as the executable with:

```dotenv
CAREER_HOME=.
```

Then `jobs.sqlite`, `profile.draft.md`, and `storage/` stay in the same directory as the executable.

## Skill library

The executable does not embed `src/skills/library/`. If you want skill selection to work in binary mode, copy the folder next to the executable:

```powershell
xcopy /E /I src\skills\library skills
```

Or on macOS/Linux:

```bash
cp -r src/skills/library skills
```

## Binary limitation

The executable does not include `pdf-parse`. PDF extraction falls back to regex, which works well for text-layer PDFs. Image/scan PDFs require the repo or npm install.

## Next step

Set up the AI: [04 — Setting up Ollama](04-setting-up-ollama.md) or [05 — Remote LLMs](05-setting-up-remote-llms.md).
