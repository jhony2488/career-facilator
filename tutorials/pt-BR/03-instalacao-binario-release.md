# Tutorial 03 — Instalação pelo release (app desktop + CLI)

Baixe um instalador que entrega **as duas coisas**: o aplicativo com janela nativa e o comando `career` pronto no terminal — os dois usam os mesmos dados e funcionam em conjunto (modelo do Git: `git` + `git-gui`). Não precisa instalar Node.js nem npm.

## Baixar

Acesse a aba **[Releases](https://github.com/jhony2488/career-facilitator/releases)** do repositório no GitHub e escolha o instalador do seu sistema:

| Sistema               | Pacote                         |
| --------------------- | ------------------------------ |
| Windows               | `career-ui-windows-x64.exe`    |
| macOS (Apple Silicon) | `career-ui-macos-arm64.dmg`    |
| macOS (Intel)         | `career-ui-macos-x64.dmg`      |
| Linux                 | `career-ui-linux-x64.AppImage` |

Dentro de cada pacote já vem embutido:

```
CareerFacilator AI
├── career-ui                  # app desktop (janela nativa)
├── career-<target-triple>     # o CLI completo (sidecar embutido)
├── career-runtime/            # módulos externos + Chromium + tessdata (OCR)
└── skills/                    # biblioteca de skills dinâmicas
```

## Windows

1. Baixe `career-ui-windows-x64.exe` e execute — o instalador NSIS é por usuário, não pede admin.
2. O SmartScreen pode avisar que o binário não é assinado: **Mais informações** → **Executar mesmo assim**.
3. Abra o app pelo menu Iniciar (ou pelo atalho criado).

Na primeira abertura o app grava `career.cmd` em `%LOCALAPPDATA%\Microsoft\WindowsApps` — uma pasta que já está no PATH do usuário. **Abra um terminal novo** e o comando `career` já responde:

```powershell
career status
career discover
career ui          # mesmo dashboard da janela, no navegador
```

## macOS

1. Baixe o `.dmg` do seu chip, abra e arraste **CareerFacilator AI** para `/Applications`.
2. Abra o app — se o Gatekeeper bloquear: `xattr -dr com.apple.quarantine "/Applications/CareerFacilator AI.app"`.

Na primeira abertura o app grava um shim `career` em `/opt/homebrew/bin` (se houver homebrew) ou `/usr/local/bin`. Se nenhum for gravável, o macOS pede sua senha uma vez para instalar o shim. Depois disso, num terminal novo:

```bash
career status
career discover
```

> Se você recusou o prompt de senha, o app não pergunta de novo (marker `~/.careerfacilator/cli-shim-declined` — apague-o para tentar outra vez, ou crie o symlink manualmente).

## Linux

1. Baixe `career-ui-linux-x64.AppImage`, `chmod +x` e execute uma vez.

```bash
chmod +x career-ui-linux-x64.AppImage
./career-ui-linux-x64.AppImage     # abre a janela e registra o CLI
```

Na primeira execução o app grava `~/.local/bin/career` — um shim que chama o próprio AppImage em modo CLI. Se `~/.local/bin` estiver no seu PATH (padrão nas distros atuais), o comando `career` já funciona num terminal novo.

O Chromium embutido pode pedir bibliotecas de sistema — na primeira execução de formulário web, instale o equivalente a `npx playwright install-deps chromium` (ex.: `libatk1.0-0`, `libnss3`, `libcups2`, `libxkbcommon0` no Debian/Ubuntu).

## App e CLI em conjunto

- O comando `career` é o **mesmo binário embutido** no app — não é uma cópia separada.
- Janela e terminal compartilham `CAREER_HOME`, cofre e `jobs.sqlite`: o que você faz na UI aparece no `career status` do terminal e vice-versa.
- O shim já injeta `CAREER_RUNTIME` (e `CAREER_SKILLS`) apontando para os recursos embutidos — autofill web, OCR e leitura de PDF funcionam do terminal igual na janela.
- O shim é reescrito a cada abertura do app: se você mover o AppImage ou o `.app` de lugar, o comando se auto-corrige na próxima execução.

## Inicializar configuração

```powershell
career config init     # cria ~/.careerfacilator/ com .env e as pastas de dados
career config path     # mostra onde está o .env efetivo
```

A configuração também pode ser feita pela própria janela do app (aba de configuração — os valores são os mesmos do `config set`).

## O que funciona logo de cara

- Interface gráfica completa (janela nativa) + todos os comandos do CLI
- Formulários web (autofill Chromium) — mesmo motor da instalação por código
- Fontes autenticadas (`render: true`, LinkedIn/Gupy com login) e `career login`
- Leitura de PDF com camada de texto via `pdf-parse`
- OCR de imagens em posts (tesseract `por`+`eng`, offline — `career-runtime/tessdata`)
- Biblioteca de skills embutida

## Próximo passo

Configure a IA: [04 — Configurando Ollama](04-configurando-ollama.md) ou [05 — IAs remotas](05-configurando-ias-remotas.md).
Referência completa de execução e configuração: [08 — Executável de release](08-executavel-release.md).
Interface gráfica em detalhes: [09 — Interface gráfica](09-interface-grafica.md).
