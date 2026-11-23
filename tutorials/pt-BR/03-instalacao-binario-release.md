# Tutorial 03 — Instalação pelo binário de release

Baixe um pacote com executável único + recursos externos. Não precisa instalar Node.js nem npm.

## Baixar

Acesse a aba **[Releases](https://github.com/jhony2488/career-facilitator/releases)** do repositório no GitHub e escolha o **ZIP** do seu sistema (recomendado — já vem completo):

| Sistema                    | Pacote                     |
| -------------------------- | -------------------------- |
| Windows                    | `career-windows-x64.zip`   |
| macOS (Apple Silicon)      | `career-macos-arm64.zip`   |
| macOS (Intel)              | `career-macos-x64.zip`     |
| Linux                      | `career-linux-x64.zip`     |

Dentro do ZIP:

```
career-<os>-<arch>/
├── career.exe | career        # executável único (Node SEA)
├── career-runtime/            # módulos externos + Chromium + tessdata (OCR)
├── skills/                    # biblioteca de skills dinâmicas
└── .env.example               # referência de todas as configurações
```

> Também existe o binário solto (`career-<os>-<arch>[.exe]`) para quem quiser baixar só o executável — depois `career runtime setup` baixa o `career-runtime-<os>-<arch>.tar.gz` e completa os recursos (ver seção abaixo).

## Windows

1. Baixe `career-windows-x64.zip` e descompacte, por exemplo em `C:\Tools\CareerFacilator`.
2. Execute pela primeira vez:

```powershell
C:\Tools\CareerFacilator\career-windows-x64\career.exe status
```

O Windows SmartScreen pode avisar que o binário não é assinado. Clique em **Mais informações** → **Executar mesmo assim**. O mesmo pode acontecer com o Chromium do `career-runtime` em antivírus mais agressivos — é o navegador oficial do Playwright, pode liberar.

## macOS

Apple Silicon (`arm64`) ou Intel (`x64`):

```bash
unzip career-macos-arm64.zip
cd career-macos-arm64
xattr -dr com.apple.quarantine .        # libera exe + Chromium (Gatekeeper)
./career status
```

O `xattr -dr` remove o bloqueio de quarentena **na pasta inteira** — necessário também para o Chromium dentro de `career-runtime/`.

## Linux

```bash
unzip career-linux-x64.zip
cd career-linux-x64
chmod +x career
./career status
```

O Chromium do runtime pode pedir bibliotecas de sistema — na primeira execução de formulário web, instale o equivalente a `npx playwright install-deps chromium` (ex.: `libatk1.0-0`, `libnss3`, `libcups2`, `libxkbcommon0` no Debian/Ubuntu).

## Binário solto + `runtime setup`

Se preferir só o executável (`career-<os>-<arch>[.exe]`):

```powershell
career.exe runtime status   # diagnóstico do que falta
career.exe runtime setup    # baixa career-runtime-<os>-<arch>.tar.gz do release e extrai ao lado
```

Sem o runtime, o binário ainda roda descoberta por APIs/RSS, triagem, e-mail, WhatsApp e fila de revisão — formulários web, LinkedIn autenticado, PDF com camada de texto e OCR de posts só ativam com o `career-runtime/` presente.

## Inicializar configuração

```powershell
career.exe config init     # Windows
./career config init       # macOS / Linux
```

Isso cria `~/.careerfacilator/` com `.env` e as pastas de dados.

## Modo portátil (dados ao lado do executável)

Crie um arquivo `.env` na mesma pasta do executável com:

```dotenv
CAREER_HOME=.
```

Assim `jobs.sqlite`, `profile.draft.md`, `storage/` e o próprio `.env` da pasta do exe mantêm tudo no mesmo diretório — **o `.env` da pasta do executável vale acima do `.env` do diretório de trabalho** (abaixo apenas de variáveis de ambiente reais), e o `CAREER_HOME` relativo ancora na pasta do binário mesmo chamando de outro cwd.

## O que funciona com o runtime completo

- Formulários web (autofill Chromium) — mesmos da instalação por código
- Fontes autenticadas (`render: true`, LinkedIn/Gupy com login) e `career login`
- Leitura de PDF com camada de texto via `pdf-parse`
- OCR de imagens em posts (tesseract `por`+`eng`, offline — `career-runtime/tessdata`)
- Biblioteca de skills em `skills/` ao lado do exe

## Próximo passo

Configure a IA: [04 — Configurando Ollama](04-configurando-ollama.md) ou [05 — IAs remotas](05-configurando-ias-remotas.md).
Referência completa de execução e configuração do executável: [08 — Executável de release](08-executavel-release.md).
