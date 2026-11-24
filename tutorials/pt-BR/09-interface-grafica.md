# Tutorial 09 — Interface gráfica (dashboard + app desktop)

A interface gráfica é um **servidor local embutido no próprio binário** — o mesmo dashboard abre em janela app (`career ui`) ou na janela nativa do app desktop Tauri (`career-ui-<os>-<arch>`). O CLI segue funcionando exatamente como antes; a UI é uma camada visual sobre os mesmos comandos, cofre e arquivos — **feita para devs e não-devs**: o Início mostra os primeiros passos (importar CV → configurar IA → buscar vagas), as ações têm nomes e explicações claras e o material técnico fica recolhido em "Avançado"/"Detalhes técnicos".

## 1. Abrindo a interface

```powershell
career ui                    # sobe o servidor + abre janela app-mode (desktop)
career ui --port 8080        # porta fixa
career serve --no-open       # somente servidor (usado pelo app desktop)
```

O servidor escuta só em `127.0.0.1` e gera um **token de sessão** aleatório — a URL impressa já o inclui. Fechado o processo, o token morre junto.

A janela abre em **modo app** (`--app=` do Edge/Chrome — sem abas nem barra de endereço, vira janela nativa do SO). Se nenhum browser Chromium estiver instalado, abre no navegador padrão como aba comum — use a URL impressa. Para janela 100% nativa (webview do sistema), instale o pacote `career-ui` da seção 2.

## 2. App desktop (instalação separada)

O release traz instaladores separados por SO:

| Plataforma | Arquivo                           | Instalação                                   |
| ---------- | --------------------------------- | -------------------------------------------- |
| Windows    | `career-ui-windows-x64.exe`       | NSIS per-user (bootstrap WebView2 se faltar) |
| macOS      | `career-ui-macos-{arm64,x64}.dmg` | Arrastar para Applications                   |
| Linux      | `career-ui-linux-x64.AppImage`    | `chmod +x` e executar                        |

O app já inclui o binário `career` (o CLI completo) e o `career-runtime/` como recursos internos — instalação independente do pacote CLI. Ao abrir, ele sobe o servidor local e conecta a janela automaticamente.

### O comando `career` já vem registrado

Quem instala o pacote da UI **leva as duas coisas**: a janela nativa e o mesmo binário `career` utilizável no terminal. Na primeira abertura o app registra o comando `career` no seu PATH — abra um terminal novo e use direto (`career discover`, `career run`, `career ui`…):

- **Windows:** `career.cmd` em `%LOCALAPPDATA%\Microsoft\WindowsApps` (PATH de usuário por padrão)
- **macOS:** shim em `/opt/homebrew/bin` ou `/usr/local/bin` — se nenhum for gravável, o sistema pede sua senha uma vez (mova o app para `/Applications` antes de abrir)
- **Linux (AppImage):** `~/.local/bin/career` aponta para o AppImage — execute o app ao menos uma vez para criar o comando

O shim já injeta `CAREER_RUNTIME` apontando para os recursos embutidos — autofill, OCR e leitura de PDF funcionam do terminal igual na janela, e o CLI usa o mesmo `CAREER_HOME`, cofre e banco da UI. O shim é reescrito a cada abertura do app (se o app mudar de lugar, ele se auto-corrige); o caminho do executável embutido também aparece no dashboard, em "Binário do CLI".

## 3. O que cada aba faz

- **Dashboard** — versão, modo (SEA/dev), diretório de dados, contagens por status e tasks recentes.
- **Configuração** — todas as variáveis do env efetivo com a fonte de cada uma (home/cwd/exe/process). Segredos (`*_API_KEY`, senhas, tokens) saem mascarados; para trocar, clique em _editar_ e digite o valor novo — gravado no `.env` do `CAREER_HOME` igual ao `career config set`.
- **Vagas** — lista filtrável por status + busca; ações de marcação (applied, e-mail, whatsapp, pular, falhou, rejeitada…) e exclusão — mesmo efeito de `mark`/`remove`.
- **Fila** — `NEEDS_HUMAN_INPUT` + `READY_TO_REVIEW` + fila WhatsApp, com botões de decisão.
- **Cofre** — lista só refs (nunca segredos); formulário `ref` + JSON → `vault set` equivalente, mesma cifra.
- **Perfil** — `profile.master.md` view/edit (salva e recompila o `.json`), upload de PDF → `profile_inbox/`, botões `import --inbox` e `approve`.
- **Runtime** — diagnóstico do sidecar (`node_modules`, browsers, tessdata, skills, playwright) + botão `runtime setup`.
- **Terminal** — presets de comando (`discover`, `run`, `review`, `config check`…) com saída ao vivo (SSE), entrada para perguntas interativas e botão encerrar.

**Human-in-the-loop**: a UI não contorna nenhum gate — `run`/`review`/`retry` rodam o próprio binário como subprocesso, então `SEMI_AUTO`, CAPTCHA e perguntas continuam exigindo sua decisão (pelo campo de stdin da task ou pelos botões da fila).

## 4. Idioma e modos de dados

- Seletor **PT-BR / EN** no topo — preferência salva no navegador.
- `CAREER_HOME=.` (portátil) funciona: dados e `.env` ficam ao lado do exe.
- O token pode ser reaberto manualmente — copie a URL impressa para outro navegador/perfil da mesma máquina.

## 5. Compilação do app desktop (desenvolvimento)

```powershell
npm run dist                 # exe + runtime + zip (pré-requisito)
npm run build:desktop        # stage + tauri build (exige Rust toolchain)
npm run build:desktop:prep   # só staging dos binaries — sem cargo
```

Requisitos locais: Rust (`rustup`), WebView2 (Windows), `libwebkit2gtk-4.1-dev` (Linux), Xcode CLT (macOS). Sem Rust local, o build roda no CI (`release.yml`, job `build`).

---

« [Anterior: Executável de release](08-executavel-release.md) | [Índice](README.md)
