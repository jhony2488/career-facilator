# Tutorial 08 — Executável de release: execução e configuração completa

Referência detalhada do pacote distribuído: o que vem no instalador, como executar em cada sistema, e como configurar **todas** as funcionalidades sem instalar Node.js. A instalação básica está no [Tutorial 03](03-instalacao-binario-release.md).

## 1. O que vem no pacote

O release publica só o **instalador do app desktop** (`career-ui-<os>-<arch>`), que já traz tudo embutido:

```
CareerFacilator AI (instalado)
├── career-ui                  # app desktop Tauri — janela nativa
├── career-<target-triple>     # o CLI completo (Node SEA, sidecar embutido)
├── career-runtime/            # recursos que não cabem no arquivo único:
│   ├── node_modules/          #   playwright + stealth, pdf-parse, tesseract.js
│   ├── browsers/              #   Chromium do Playwright (autofill + login + render)
│   └── tessdata/              #   por.traineddata + eng.traineddata (OCR offline)
└── skills/                    # biblioteca de skills dinâmicas (SKILL.md + keywords)
```

Por que existe `career-runtime/`? Módulos como Playwright e Tesseract.js carregam arquivos próprios de disco (drivers, worker scripts, WASM, navegadores) — não cabem num binário single-file. Em vez de sacrificar recursos, o executável os carrega dessa pasta. Com o runtime completo, **todos os comandos funcionam igual à instalação por código**.

Modelo de distribuição: **um instalador = app + CLI** (como `git` + `git-gui`). O binário `career` embutido é o mesmo que a janela usa — e o app o registra no seu PATH na primeira abertura, então `career <cmd>` funciona em qualquer terminal.

## 2. Instalação por sistema operacional

### Windows

```powershell
.\career-ui-windows-x64.exe        # instalador NSIS por usuário (sem admin)
career --version                    # num terminal NOVO, após abrir o app 1×
```

- SmartScreen: **Mais informações → Executar mesmo assim** (binário sem assinatura).
- Antivírus: alguns podem sinalizar o Chromium dentro de `career-runtime/browsers/` — é o build oficial do Playwright; libere a pasta.
- Na primeira abertura o app grava `career.cmd` em `%LOCALAPPDATA%\Microsoft\WindowsApps` (já no PATH do usuário) — terminais novos enxergam `career` direto.

### macOS

```bash
# abra o .dmg e arraste "CareerFacilator AI" p/ /Applications
xattr -dr com.apple.quarantine "/Applications/CareerFacilator AI.app"
career --version                    # num terminal NOVO, após abrir o app 1×
```

O `xattr -dr` remove o bloqueio do Gatekeeper no pacote inteiro — o Chromium embutido também é liberado. O shim `career` vai para `/opt/homebrew/bin` ou `/usr/local/bin` (pode pedir senha uma vez).

### Linux

```bash
chmod +x career-ui-linux-x64.AppImage
./career-ui-linux-x64.AppImage      # abre a janela e registra o CLI
career --version                    # num terminal NOVO
```

O shim vai para `~/.local/bin/career` e aponta para o AppImage em modo `--career-cli`.

O Chromium precisa de bibliotecas de sistema. Em Debian/Ubuntu:

```bash
sudo apt install libatk1.0-0 libatk-bridge2.0-0 libcups2 libnss3 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
  libasound2 libpango-1.0-0 libcairo2
```

Sem essas libs, apenas formulários web falham — o resto segue normal.

## 3. Rodando os comandos

Depois da primeira abertura do app, o comando `career` já está no PATH — basta abrir um terminal novo. Todos os comandos abaixo são escritos como `career <cmd>`; sem argumentos, `career` abre o **shell interativo** (`career>`) com os mesmos comandos.

Se por algum motivo o shim não for criado (ex.: AppImage executado de uma pasta incomum), o caminho do binário embutido aparece no dashboard da janela, em "Binário do CLI" — dá para chamá-lo diretamente.

## 4. Runtime do executável

No pacote desktop o `career-runtime/` já vem embutido — o shim do CLI injeta `CAREER_RUNTIME` apontando para ele automaticamente. O diagnóstico segue disponível:

```powershell
career runtime status    # diagnóstico: node_modules, browsers, tessdata, skills
```

- `CAREER_RUNTIME=/caminho/para/career-runtime` aponta o runtime para outro local (ex.: um runtime único servindo várias instalações).
- `CAREER_SKILLS=/caminho/para/skills` faz o mesmo para a biblioteca de skills — o shim do app já aponta para a embutida.
- `career runtime setup` existe para quem gera o binário localmente (`npm run dist`) sem a pasta ao lado — no pacote do release ela já vem incluída.
- Sem o runtime: descoberta por APIs/RSS, triagem, e-mail, WhatsApp, revisão e cofre funcionam; formulários web e fontes com login degradam para `NEEDS_HUMAN_INPUT`/canais de mensagem — nada quebra, só degrada.

## 5. Configuração — cadeia completa

Precedência (a mais forte vence):

```
variáveis de ambiente (set/export)
    ↑
.env na pasta do executável
    ↑
.env do diretório de trabalho (cwd)
    ↑
.env do diretório de dados (<CAREER_HOME>/.env)
    ↑
defaults do código
```

### Duas formas de configurar

**Global (recomendado para uso pessoal):**

```powershell
career config init        # cria ~/.careerfacilator/ com .env + pastas
career config path        # mostra onde está o .env efetivo
career config set CHAVE valor
career config get CHAVE   # valor efetivo (avisa se outro arquivo sombreia)
```

**Portátil (tudo na pasta do exe — pendrive, pasta em nuvem etc.):**

Crie `.env` ao lado do executável com `CAREER_HOME=.` — dados, config, cofre e sessões ficam na mesma pasta. Esse `.env` já vale acima do `.env` do cwd; só variáveis de ambiente reais o superam.

> `career config set` escreve sempre no `.env` do home. Para editar o `.env` do exe, abra o arquivo diretamente.

## 6. Configurando a IA

### 6.1 Ollama local (grátis, padrão)

O executável **não instala o Ollama** — instale-o à parte (ver [Tutorial 04](04-configurando-ollama.md) para download e modelos por RAM):

```powershell
ollama pull qwen2.5:7b
career config set AI_LOCAL_PROVIDER ollama
career config set AI_LOCAL_MODEL qwen2.5:7b
career config set AI_FAST_PROVIDER ollama
career config set AI_FAST_MODEL qwen2.5:7b
career config set AI_SMART_PROVIDER ollama
career config set AI_SMART_MODEL qwen2.5:7b
career config set OLLAMA_BASE_URL http://localhost:11434
career config check        # preflight: testa cada tier contra o provider
```

`OLLAMA_BASE_URL` aceita outro host/porta (GPU remota, Docker, WSL).

### 6.2 Providers remotos (OpenAI-compatíveis)

Um adapter cobre `deepseek`, `groq`, `openai`, `kimi`/`moonshot`, `openrouter`, `together` e qualquer endpoint OpenAI-compatível custom via `<PROVIDER>_BASE_URL`:

```powershell
career config set AI_SMART_PROVIDER groq
career config set AI_SMART_MODEL llama-3.3-70b-versatile
career config set GROQ_API_KEY gsk_...
```

| Provider          | Env de API key       | Env de base URL (custom)        |
| ----------------- | -------------------- | ------------------------------- |
| `deepseek`        | `DEEPSEEK_API_KEY`   | `DEEPSEEK_BASE_URL`             |
| `groq`            | `GROQ_API_KEY`       | `GROQ_BASE_URL`                 |
| `openai`          | `OPENAI_API_KEY`     | `OPENAI_BASE_URL`               |
| `kimi`/`moonshot` | `KIMI_API_KEY`       | `KIMI_BASE_URL`                 |
| `openrouter`      | `OPENROUTER_API_KEY` | `OPENROUTER_BASE_URL`           |
| `together`        | `TOGETHER_API_KEY`   | `TOGETHER_BASE_URL`             |
| `anthropic`       | `ANTHROPIC_API_KEY`  | — (sem adapter nativo)          |
| `gemini`          | `GEMINI_API_KEY`     | use o endpoint compat da Google |

Tiers: `AI_LOCAL_*` (triagem), `AI_FAST_*` (respostas de formulário), `AI_SMART_*` (tailoring/raciocínio). Também aceitam `AI_<TIER>_BASE_URL` por tier.

### 6.3 Fallbacks entre tiers

```dotenv
AI_LOCAL_FALLBACK=fast            # local falha → usa tier fast
AI_SMART_FALLBACK=groq:llama-3.3-70b-versatile   # provider:modelo explícito
AI_FALLBACK_ENABLED=false         # desliga todos os fallbacks
```

### 6.4 Embeddings semânticos (opcional, Ollama)

```powershell
ollama pull nomic-embed-text
career config set AI_EMBEDDINGS_ENABLED true
career config set OLLAMA_EMBED_MODEL nomic-embed-text
```

Ativa match semântico de `JOB_TITLES` e RAG do perfil no tailoring.

## 7. Modo de execução e réguas

```dotenv
EXECUTION_MODE=HYBRID_THRESHOLD    # FULL_AUTO | SEMI_AUTO | HYBRID_THRESHOLD
FIT_MIN_SCORE=75                   # mínimo p/ tailor
FIT_AUTO_SCORE=88                  # ≥ este score → envio automático no modo híbrido
LEXICAL_MIN_TERMS=1                # filtro lexical da Camada 0
JOB_TITLES="backend developer; fullstack developer; engenheiro de software"
```

- `SEMI_AUTO` → toda vaga vai para revisão (`review`) antes de qualquer envio.
- `HYBRID_THRESHOLD` → auto-envia só quem atinge `FIT_AUTO_SCORE`; o resto fica na fila.
- `FULL_AUTO` → envia tudo que passar da régua.

## 8. Descoberta (discovery)

```dotenv
DISCOVERY_SOURCES=remoteok,remotive,linkedin    # vazio = fontes padrão habilitadas
DISCOVERY_EXCLUDE_SOURCES=programathor
DISCOVERY_REGIONS=BR,GLOBAL                     # BR,LATAM,PT,EU,US,GLOBAL,ASIA,OCEANIA
DISCOVERY_WORK_MODELS=REMOTE,HYBRID
DISCOVERY_MAX_JOBS_PER_SOURCE=20
DISCOVERY_MAX_JOBS_PER_RUN=100
DISCOVERY_MIN_JOBS_PER_RUN=0       # meta de envios por run (0 = off)
DISCOVERY_CONCURRENCY=4
DISCOVERY_USE_GENERIC_FALLBACK=true            # extrator LLM p/ páginas sem API
DISCOVERY_GENERIC_MODEL=                       # vazio herda AI_LOCAL_*
DISCOVERY_SEARCH_ENGINE=duckduckgo             # duckduckgo|bing|none
DISCOVERY_BROWSER_PROFILE_DIR=                 # sessão p/ fontes render:true/LinkedIn
DISCOVERY_ATS_BOARDS=greenhouse:acme,lever:stripe
DISCOVERY_POSTS_OCR=true                        # OCR em imagens de posts LinkedIn
DISCOVERY_SCROLL_MAX=5                          # scroll da página viva no LinkedIn
```

Comandos úteis:

```powershell
career discover                          # só busca — não aplica a nada
career discover --export jobs.json       # exporta para revisão posterior
career discover --dry-run                # lista fontes ativas sem buscar
career scan remoteok --max-jobs 3        # testa uma fonte específica
career run --jobs-file jobs.json         # processa o lote exportado
career run --dry-run                     # funil inteiro sem enviar nada
```

`discover` não grava em `jobs.sqlite`; `run` registra os jobs e os estados de revisão.

## 9. E-mail (SMTP + cofre + IMAP/OTP)

```dotenv
EMAIL_ENABLED=true
EMAIL_DISPATCH_MODE=HYBRID            # HYBRID | FULL_AUTO | REVIEW_ONLY
EMAIL_MAX_DAILY=45                    # teto de envios/dia
EMAIL_MIN_SCORE_AUTO_SEND=88
EMAIL_SMTP_CREDENTIAL_REF=smtp-main
EMAIL_COOLDOWN_DAYS=30                # dias sem reenviar p/ mesmo destinatário
EMAIL_TEMPLATE_PATH=storage/email_template.md
EMAIL_INCLUDE_SALARY=true
```

**Credencial SMTP no cofre** (nunca em `.env`):

```powershell
career vault set smtp-main    # pede host/port/user/pass; cifra AES-256-GCM
career vault list
```

Gmail: use "Senha de app" (App Password). O cofre fica em `<CAREER_HOME>/storage/credentials.vault.enc` — no modo portátil, vai junto na pasta.

**OTP por e-mail** (códigos de verificação em logins):

```powershell
career vault set imap-main    # host/port/secure/user/pass da caixa IMAP
```

Com `smtp-main` do Gmail/Outlook, o host IMAP é derivado sozinho. Logins de portal no cofre: `career vault set login-gupy.io` (user+senha do portal) — o autofill preenche o signin sozinho; cookies de sessão são guardados como `session-<domínio>`.

## 10. WhatsApp

```dotenv
WHATSAPP_ENABLED=true
WHATSAPP_MODE=MANUAL_QUEUE           # MANUAL_QUEUE | EVOLUTION_API
WHATSAPP_TEMPLATE_PATH=storage/whatsapp_template.md
WHATSAPP_COOLDOWN_DAYS=30
WHATSAPP_ATTACH_RESUME=true
```

- `MANUAL_QUEUE` (default): número + mensagem + PDF vão para a fila do `review`; confirme o envio com `mark <url> whatsapp` ou pelo review interativo.
- `EVOLUTION_API`: instância real — configure `EVOLUTION_API_URL` + `EVOLUTION_API_KEY` e rode `career whatsapp setup` (cria instância e mostra QR/pairing no terminal). `career whatsapp status` confere.

## 11. Navegador e autofill

```dotenv
AUTOFILL_HEADLESS=true                  # false = janela visível
AUTOFILL_PROFILE_DIR=storage/browser_profile   # perfil persistente (reusa logins)
AUTOFILL_STEALTH=true                   # plugin stealth anti-detecção
AUTOFILL_HUMAN_PACE=true                # mouse em curva + digitação com delay
AUTOFILL_VISIBLE_ON_ESCALATION=true     # CAPTCHA/OTP/login reabre visível
AUTOFILL_AGENT_NAV=true                 # agente navega até o form (nunca submete)
AUTOFILL_DEBUG_FILL=false               # loga campo→valor→fonte
AUTOFILL_QUESTION_SIMILARITY_THRESHOLD=0.9
AUTOFILL_DEFAULTS=authorized to work=yes;requires sponsorship=no
```

**Logins em portais** (LinkedIn, Gupy, Glassdoor…):

```powershell
career login https://www.linkedin.com   # abre Chromium visível — faça o login
```

A sessão fica no perfil persistente e serve para descoberta (`render: true`) e autofill — um login só alimenta os dois.

## 12. Perfil-mestre

```powershell
career import --pdf CV.pdf       # estrutura via IA → rascunho p/ revisão
career import --inbox            # processa storage/profile_inbox/
career approve                   # promove rascunho → profile.master.md
```

Paths finos (relativos a `CAREER_HOME` ou absolutos): `PROFILE_INBOX_DIR`, `PROFILE_DRAFT_PATH`, `PROFILE_MASTER_PATH`, `PROFILE_COMPILED_PATH`, `PROFILE_HISTORY_DIR`, `JOBS_DB_PATH`.

## 13. Rotina diária de comandos

```powershell
career discover --export jobs.json   # busca hoje, aplica depois
career run --jobs-file jobs.json     # processa o lote
career review                        # pendências NEEDS_HUMAN_INPUT + fila WhatsApp
career retry --send                  # retenta forms web (envia ao fim)
career mark <url|id> applied         # marcação manual da fila
career status                        # contagens por status
career applied --limit 10            # o que já foi enviado
career inspect <url>                 # diagnostica um form sem preencher
```

## 14. Resolução de problemas

| Sintoma                                           | Causa provável                      | Ação                                                                       |
| ------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| `playwright indisponível` / forms caem em revisão | `career-runtime/` ausente           | `runtime setup` ou use o ZIP completo; `runtime status` confirma           |
| Chromium não abre no Linux                        | libs de sistema ausentes            | ver §2 (apt)                                                               |
| macOS "não é possível verificar o desenvolvedor"  | quarentena                          | `xattr -dr com.apple.quarantine .` na pasta                                |
| SmartScreen/antivírus                             | binário/Chromium sem assinatura     | liberar execução (§2)                                                      |
| PDF de CV sai mal                                 | PDF escaneado (sem camada de texto) | reexporte o CV com texto selecionável                                      |
| OCR não roda offline                              | `tessdata/` ausente                 | runtime completo ou `CAREER_RUNTIME` correto                               |
| `.env` ignorado                                   | está na pasta errada                | `.env` do exe > `.env` do cwd — `config path`/`config get` mostram a fonte |
| `config init` falha                               | `~/.careerfacilator` sem permissão  | use `CAREER_HOME=.` no `.env` do exe (portátil)                            |
| Ollama "connection refused"                       | serviço parado                      | `ollama serve` + `ollama pull <modelo>`                                    |
| Provider remoto 401                               | API key                             | `config set <P>_API_KEY ...` + `config check`                              |
| Mudou de pasta e perdeu dados                     | `CAREER_HOME` relativo mudou        | no exe, `CAREER_HOME` ancora na pasta do binário — leve a pasta inteira    |
| `tar` não encontrado no `runtime setup`           | Windows muito antigo                | use o instalador do app (runtime já embutido)                              |
| Node antigo gerando o exe                         | `node:sqlite` exige Node ≥ 22.13    | só afeta quem compila; binários prontos já vêm ok                          |

## 15. Diferenças pacote × instalação por código

Com o `career-runtime/` embutido (sempre presente no pacote): **nenhuma diferença funcional**. O que a instalação não traz sozinha: Ollama (instalação à parte) e configuração inicial (`config init` ou `.env`).
