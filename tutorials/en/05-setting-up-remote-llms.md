# Tutorial 05 — Setting up remote LLMs

Besides Ollama, CareerFacilator reserves configuration slots for cloud providers. This is useful for fallback or when you want faster processing without relying on local hardware.

## Current adapter status

Only **Ollama** has a working adapter in this version. The other providers can be configured, but still raise `ProviderNotImplementedError` until an adapter is contributed.

You can use remote configuration to:

- Document which provider/model you intend to use in the future.
- Use fallback (`AI_*_FALLBACK`) to redirect an unavailable tier to another.

## Provider table

| Provider | Dashboard | API key env | Model env | Example config |
|----------|-----------|-------------|-----------|----------------|
| Groq | [console.groq.com](https://console.groq.com) | `GROQ_API_KEY` | `GROQ_MODEL` | `AI_SMART_PROVIDER=groq` + `AI_SMART_MODEL=llama-3.3-70b-versatile` |
| Anthropic | [console.anthropic.com](https://console.anthropic.com) | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` | `AI_SMART_PROVIDER=anthropic` + `AI_SMART_MODEL=claude-3-5-haiku-latest` |
| OpenAI | [platform.openai.com](https://platform.openai.com) | `OPENAI_API_KEY` | `OPENAI_MODEL` | `AI_SMART_PROVIDER=openai` + `AI_SMART_MODEL=gpt-4o-mini` |
| Kimi / Moonshot | [platform.moonshot.ai](https://platform.moonshot.ai) | `KIMI_API_KEY` | `KIMI_MODEL` | `AI_SMART_PROVIDER=kimi` + `AI_SMART_MODEL=moonshot-v1-8k` |
| Gemini / Google | [aistudio.google.com](https://aistudio.google.com) | `GEMINI_API_KEY` | `GEMINI_MODEL` | `AI_SMART_PROVIDER=gemini` + `AI_SMART_MODEL=gemini-2.0-flash` |

## Configure via CLI

```powershell
career config set AI_SMART_PROVIDER groq
career config set GROQ_API_KEY gsk_...        # never commit
career config set GROQ_MODEL llama-3.3-70b-versatile
```

`career config set` writes to `<home>/.env`, which is in `.gitignore`.

## Direct `.env` configuration

```dotenv
AI_SMART_PROVIDER=groq
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile

AI_FAST_PROVIDER=ollama
AI_FAST_MODEL=qwen2.5:7b

AI_LOCAL_PROVIDER=ollama
AI_LOCAL_MODEL=llama3.2:3b
```

## Tier fallback

While remote adapters are not ready, set fallback to Ollama:

```dotenv
AI_FALLBACK_ENABLED=true
AI_LOCAL_FALLBACK=fast
AI_FAST_FALLBACK=ollama:qwen2.5:7b
AI_SMART_FALLBACK=ollama:qwen2.5:14b
```

If the `SMART` tier fails, the system tries `qwen2.5:14b` on Ollama.

## When to use each provider

- **Groq**: low latency, competitive pricing. Llama/Mistral models available. Great for `FAST` and `SMART`.
- **Anthropic**: Claude Haiku/Sonnet — good for English and structured reasoning. Ideal for `SMART`.
- **OpenAI**: GPT-4o-mini is cheap and fast; GPT-4o for heavier tasks.
- **Kimi / Moonshot**: good for Chinese/English and long context.
- **Gemini**: Flash 2.0 is fast and has a large context window. Useful for long resumes.

## Context window

Cloud models usually support larger context windows than local Ollama. Start with:

```dotenv
AI_NUM_CTX=8192
```

Raise to 16384 or 32768 if the resume is extensive and the provider supports it.

## Test

```powershell
career config check
```

If you are using only Ollama, it will show `OK` for Ollama and `FAILED` for the others — this is expected until the adapters are implemented.

## Security

- Never commit API keys.
- Do not put `*_API_KEY` in public logs or prints.
- Use `career config set` or a `<home>/.env` outside the repository.
