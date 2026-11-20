# Tutorial 05 — Configurando IAs remotas

Além do Ollama, o CareerFacilator reserva slots de configuração para provedores em nuvem. Isso é útil para fallback ou quando você quer processamento mais rápido sem depender do hardware local.

## Estado atual dos adapters

Apenas o **Ollama** tem adapter implementado e funcional nesta versão. Os demais provedores podem ser configurados, mas ainda disparam `ProviderNotImplementedError` até que um adapter seja contribuído.

Você pode usar a configuração remota para:

- Documentar qual provider/modelo pretende usar no futuro.
- Aproveitar o fallback (`AI_*_FALLBACK`) para redirecionar um tier indisponível para outro.

## Tabela de provedores

| Provedor        | Dashboard                                              | Env de API key      | Env de modelo     | Exemplo de configuração                                                  |
| --------------- | ------------------------------------------------------ | ------------------- | ----------------- | ------------------------------------------------------------------------ |
| Groq            | [console.groq.com](https://console.groq.com)           | `GROQ_API_KEY`      | `GROQ_MODEL`      | `AI_SMART_PROVIDER=groq` + `AI_SMART_MODEL=llama-3.3-70b-versatile`      |
| Anthropic       | [console.anthropic.com](https://console.anthropic.com) | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` | `AI_SMART_PROVIDER=anthropic` + `AI_SMART_MODEL=claude-3-5-haiku-latest` |
| OpenAI          | [platform.openai.com](https://platform.openai.com)     | `OPENAI_API_KEY`    | `OPENAI_MODEL`    | `AI_SMART_PROVIDER=openai` + `AI_SMART_MODEL=gpt-4o-mini`                |
| Kimi / Moonshot | [platform.moonshot.ai](https://platform.moonshot.ai)   | `KIMI_API_KEY`      | `KIMI_MODEL`      | `AI_SMART_PROVIDER=kimi` + `AI_SMART_MODEL=moonshot-v1-8k`               |
| Gemini / Google | [aistudio.google.com](https://aistudio.google.com)     | `GEMINI_API_KEY`    | `GEMINI_MODEL`    | `AI_SMART_PROVIDER=gemini` + `AI_SMART_MODEL=gemini-2.0-flash`           |

## Configurar pela CLI

```powershell
career config set AI_SMART_PROVIDER groq
career config set GROQ_API_KEY gsk_...        # não commitar
career config set GROQ_MODEL llama-3.3-70b-versatile
```

Lembre-se: `career config set` grava em `<home>/.env`, que está no `.gitignore`.

## Configuração direta no .env

```dotenv
AI_SMART_PROVIDER=groq
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile

AI_FAST_PROVIDER=ollama
AI_FAST_MODEL=qwen2.5:7b

AI_LOCAL_PROVIDER=ollama
AI_LOCAL_MODEL=llama3.2:3b
```

## Fallback entre tiers

Enquanto os adapters remotos não estiverem prontos, configure o fallback para Ollama:

```dotenv
AI_FALLBACK_ENABLED=true
AI_LOCAL_FALLBACK=fast
AI_FAST_FALLBACK=ollama:qwen2.5:7b
AI_SMART_FALLBACK=ollama:qwen2.5:14b
```

Se o tier `SMART` falhar, o sistema tenta o modelo `qwen2.5:14b` no Ollama.

> **Nota (discovery):** o fallback genérico de extração de HTML (`DISCOVERY_USE_GENERIC_FALLBACK`) só roda no provider `ollama` hoje — se `AI_LOCAL_PROVIDER` for remoto, o extrator fica desativado até haver adapter para esse provider.

## Quando usar cada provedor

- **Groq**: latência baixa e preço competitivo. Modelos Llama/Mistral disponíveis. Ótimo para `FAST` e `SMART`.
- **Anthropic**: Claude Haiku/Sonnet — bom para inglês e raciocínio estruturado. Ideal para `SMART`.
- **OpenAI**: GPT-4o-mini é barato e rápido; GPT-4o para tarefas mais pesadas.
- **Kimi / Moonshot**: bom para chinês/inglês e contexto longo.
- **Gemini**: Flash 2.0 é rápido e tem janela grande. Útil para currículos longos.

## Contexto (context window)

Modelos em nuvem geralmente suportam janelas maiores que Ollama local. Comece com:

```dotenv
AI_NUM_CTX=8192
```

Aumente para 16384 ou 32768 se o currículo for extenso e o provedor suportar.

## Testar

```powershell
career config check
```

Se estiver usando apenas Ollama, o resultado mostra `OK` para Ollama e `FALHOU` para os demais — isso é esperado até os adapters serem implementados.

## Segurança

- Nunca commitar chaves de API.
- Não colocar `*_API_KEY` em mensagens de log ou prints públicos.
- Use `career config set` ou `<home>/.env` fora do repositório.
