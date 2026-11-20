# Tutorial 04 — Setting up Ollama (local AI)

Ollama runs language models on your own machine, with no per-token cost. This is the recommended option for triage, profile structuring, and resume tailoring.

## Install Ollama

### Windows

Download from [ollama.com/download](https://ollama.com/download) and run the installer. The service starts automatically.

### macOS

```bash
brew install --cask ollama
```

Or download from [ollama.com/download](https://ollama.com/download).

### Linux

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

## Check the service

```bash
ollama --version
ollama list
```

Start manually if needed:

```bash
ollama serve
```

Keep the terminal open or configure the OS service to start automatically.

## Choose models by RAM/VRAM

Ollama quantizes models to 4 bits by default. The required memory is roughly the `.gguf` file size plus some OS overhead.

| Free memory    | Recommended models                                                             | Suggested use                                    |
| -------------- | ------------------------------------------------------------------------------ | ------------------------------------------------ |
| ~8 GB          | `llama3.2:3b`, `qwen2.5:3b`, `hermes3:latest`, `gemma2:2b`                     | Fast triage (`LOCAL`) and medium triage (`FAST`) |
| ~16 GB         | `mistral:7b`, `qwen2.5:7b`, `gemma2:9b`, `llama3.1:8b`                         | Triage + simple tailoring (`SMART`)              |
| ~32 GB or more | `qwen2.5:14b`, `qwen2.5:32b`, `mistral-nemo:12b`, `deepseek-coder-v2:16b-lite` | More refined tailoring and PDF structuring       |
| CPU only       | Any of the above, but slower. Use 3B for tests.                                | Raise `AI_TIMEOUT_MS`                            |

### Embedding models

To enable semantic RAG and title matching by similarity, download:

```bash
ollama pull nomic-embed-text
```

Approximate size: 270 MB.

## Download the models

Example for 8 GB RAM:

```bash
ollama pull llama3.2:3b
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
```

Example for 16 GB:

```bash
ollama pull qwen2.5:7b
ollama pull qwen2.5:14b
ollama pull nomic-embed-text
```

## Configure CareerFacilator tiers

You can edit `.env` by hand or use the CLI.

```powershell
career config set AI_LOCAL_PROVIDER ollama
career config set AI_LOCAL_MODEL llama3.2:3b
career config set AI_FAST_PROVIDER ollama
career config set AI_FAST_MODEL qwen2.5:7b
career config set AI_SMART_PROVIDER ollama
career config set AI_SMART_MODEL qwen2.5:14b
career config set OLLAMA_BASE_URL http://localhost:11434
career config set OLLAMA_KEEP_ALIVE 10m
```

## Adjust context (`AI_NUM_CTX`)

The full resume is sent in the `structurer` and `tailor` prompts. If the context window is too small, the model loses information from the end of the text.

| Model size | Recommended `AI_NUM_CTX` |
| ---------- | ------------------------ |
| 3B         | 2048 to 4096             |
| 7B–8B      | 4096 to 8192             |
| 14B+       | 8192 to 16384            |

Example:

```powershell
career config set AI_NUM_CTX 4096
```

If the resume is very long and the model truncates, raise to 8192 or use a larger model.

## Timeout and keep alive

On CPU, the first response can take several minutes.

```powershell
career config set AI_TIMEOUT_MS 600000      # 10 minutes
career config set OLLAMA_KEEP_ALIVE 10m     # keep model in memory for 10 min
```

Use `-1` in `OLLAMA_KEEP_ALIVE` to never unload, and `0` to unload immediately after each call.

## Enable embeddings

```powershell
career config set AI_EMBEDDINGS_ENABLED true
career config set OLLAMA_EMBED_MODEL nomic-embed-text
```

This makes title matching use `nomic-embed-text` as a fallback when the lexical match fails, and allows the `tailor` to use hybrid RAG.

## Test the configuration

```powershell
career config check
```

This tests the endpoint, model, and embeddings.

## Test a real task

```powershell
career import --pdf cv.pdf --dry-run
# or, if you already have jobs.json
career run --jobs-file jobs.json --dry-run
```

Use `--verbose` to see tokens being generated.

## Performance tips

- NVIDIA/AMD GPUs accelerate a lot. On macOS, Metal works automatically on Apple Silicon.
- Run Ollama on the same machine as the CLI to avoid network latency.
- If a model is too slow, reduce `AI_NUM_CTX` or use a smaller model in the `SMART` tier.
- Use `ollama ps` to see which models are loaded in memory.
