# Tutorial 04 — Configurando Ollama (IA local)

Ollama roda modelos de linguagem no seu computador, sem custo por token. É a opção recomendada para triagem, estruturação e tailor de currículo.

## Instalar o Ollama

### Windows

Baixe em [ollama.com/download](https://ollama.com/download) e execute o instalador. O serviço inicia automaticamente.

### macOS

```bash
brew install --cask ollama
```

Ou baixe em [ollama.com/download](https://ollama.com/download).

### Linux

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

## Verificar o serviço

```bash
ollama --version
ollama list
```

Para iniciar manualmente:

```bash
ollama serve
```

Deixe o terminal aberto ou configure o serviço do SO para iniciar sozinho.

## Escolher modelos por quantidade de RAM/VRAM

Ollama quantiza os modelos em 4 bits por padrão. A memória necessária é aproximadamente o tamanho do arquivo `.gguf` mais folga do sistema operacional.

| Memória livre | Modelos recomendados | Uso sugerido |
|---------------|----------------------|--------------|
| ~8 GB | `llama3.2:3b`, `qwen2.5:3b`, `hermes3:latest`, `gemma2:2b` | Triagem rápida (`LOCAL`) e triagem média (`FAST`) |
| ~16 GB | `mistral:7b`, `qwen2.5:7b`, `gemma2:9b`, `llama3.1:8b` | Triagem + tailor simples (`SMART`) |
| ~32 GB ou mais | `qwen2.5:14b`, `qwen2.5:32b`, `mistral-nemo:12b`, `deepseek-coder-v2:16b-lite` | Tailor mais refinado e estruturação de PDF |
| Apenas CPU | Qualquer dos acima, mas mais lentos. Use 3B para testes. | `AI_TIMEOUT_MS` alto recomendado |

### Modelos de embedding

Para ativar o RAG semântico e o match de títulos por similaridade, baixe:

```bash
ollama pull nomic-embed-text
```

Peso aproximado: 270 MB.

## Baixar os modelos

Exemplo para 8 GB de RAM:

```bash
ollama pull llama3.2:3b
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
```

Exemplo para 16 GB:

```bash
ollama pull qwen2.5:7b
ollama pull qwen2.5:14b
ollama pull nomic-embed-text
```

## Configurar os tiers do CareerFacilator

Você pode editar `.env` na mão ou usar a CLI.

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

## Ajustar o contexto (`AI_NUM_CTX`)

O currículo inteiro é enviado no prompt de `structurer` e `tailor`. Se a janela for pequena, o modelo perde informações do fim do texto.

| Tamanho do modelo | `AI_NUM_CTX` recomendado |
|-------------------|--------------------------|
| 3B | 2048 a 4096 |
| 7B–8B | 4096 a 8192 |
| 14B+ | 8192 a 16384 |

Exemplo:

```powershell
career config set AI_NUM_CTX 4096
```

Se o currículo for muito longo e o modelo truncar, suba para 8192 ou use um modelo maior.

## Timeout e keep alive

Em CPU, a primeira resposta pode demorar vários minutos.

```powershell
career config set AI_TIMEOUT_MS 600000      # 10 minutos
career config set OLLAMA_KEEP_ALIVE 10m      # mantém o modelo em memória por 10 min
```

Use `-1` em `OLLAMA_KEEP_ALIVE` para nunca descarregar, e `0` para descarregar logo após cada chamada.

## Ativar embeddings

```powershell
career config set AI_EMBEDDINGS_ENABLED true
career config set OLLAMA_EMBED_MODEL nomic-embed-text
```

Com isso, o match de títulos usa `nomic-embed-text` como fallback quando o léxico não casa, e o `tailor` pode usar RAG híbrido.

## Testar a configuração

```powershell
career config check
```

O comando testa endpoint, modelo e embeddings.

## Testar uma tarefa real

```powershell
career import --pdf cv.pdf --dry-run
# ou, se já tiver jobs.json
career run --jobs-file jobs.json --dry-run
```

Use `--verbose` se quiser ver os tokens sendo gerados.

## Dicas de performance

- GPUs NVIDIA/AMD aceleram muito. No macOS, Metal funciona automaticamente em Apple Silicon.
- Rode o Ollama na mesma máquina da CLI para evitar latência de rede.
- Se o modelo ficar lento, reduza `AI_NUM_CTX` ou use um modelo menor no `SMART` tier.
- Use `ollama ps` para ver quais modelos estão carregados na memória.
