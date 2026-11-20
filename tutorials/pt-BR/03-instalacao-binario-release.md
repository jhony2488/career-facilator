# Tutorial 03 — Instalação pelo binário de release

Baixe um executável único. Não precisa instalar Node.js nem npm.

## Baixar

Acesse a aba **Releases** do repositório no GitHub e escolha o arquivo do seu sistema:

| Sistema               | Arquivo                  |
| --------------------- | ------------------------ |
| Windows               | `career-windows-x64.exe` |
| macOS (Apple Silicon) | `career-macos-arm64`     |
| Linux                 | `career-linux-x64`       |

## Windows

1. Baixe `career-windows-x64.exe`.
2. Mova para uma pasta, por exemplo `C:\Tools\CareerFacilator`.
3. Execute pela primeira vez:

```powershell
C:\Tools\CareerFacilator\career-windows-x64.exe status
```

O Windows SmartScreen pode avisar que o arquivo não é assinado. Clique em **Mais informações** → **Executar mesmo assim**.

## macOS

1. Baixe `career-macos-arm64`.
2. No Terminal, na pasta do arquivo:

```bash
chmod +x career-macos-arm64
xattr -d com.apple.quarantine career-macos-arm64
./career-macos-arm64 status
```

O `xattr` remove o bloqueio do Gatekeeper para binários baixados da internet.

## Linux

1. Baixe `career-linux-x64`.
2. No terminal:

```bash
chmod +x career-linux-x64
./career-linux-x64 status
```

## Inicializar configuração

```powershell
career-windows-x64.exe config init   # Windows
./career-macos-arm64 config init     # macOS
./career-linux-x64 config init        # Linux
```

Isso cria `~/.careerfacilator/` com `.env` e as pastas de dados.

## Modo portátil (dados ao lado do executável)

Crie um arquivo `.env` na mesma pasta do executável com:

```dotenv
CAREER_HOME=.
```

Assim `jobs.sqlite`, `profile.draft.md` e o `storage/` ficam no mesmo diretório do executável.

## Biblioteca de skills

O executável não embarca `src/skills/library/`. Se quiser que a seleção de skills funcione no modo binário, copie a pasta para o lado do executável:

```powershell
xcopy /E /I src\skills\library skills
```

Ou no macOS/Linux:

```bash
cp -r src/skills/library skills
```

## Limitação do binário

O executável não inclui `pdf-parse`. A extração de PDF usa o fallback regex, que funciona bem em currículos com camada de texto. PDFs baseados em imagem/scan precisam da instalação pelo repositório ou npm.

## Próximo passo

Configure a IA: [04 — Configurando Ollama](04-configurando-ollama.md) ou [05 — IAs remotas](05-configurando-ias-remotas.md).
