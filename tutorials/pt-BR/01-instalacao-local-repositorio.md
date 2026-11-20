# Tutorial 01 — Instalação local pelo repositório

Este modo é ideal para quem vai editar o código ou quer ver os dados dentro da pasta do projeto.

## Pré-requisitos

- Node.js **v22** ou superior
- git
- npm

Verifique:

```powershell
node --version   # deve exibir v22.x.x
npm --version
```

## Passo a passo

1. Clone o repositório e entre na pasta:

```powershell
git clone https://github.com/jhony2488/career-facilitator-ts.git
cd career-facilitator-ts
```

2. Instale as dependências:

```powershell
npm install
```

3. Copie o template de configuração:

```powershell
cp .env.example .env
```

4. Mantenha os dados dentro do projeto (já vem configurado no `.env` exemplo):

```dotenv
CAREER_HOME=.
```

5. Teste a CLI:

```powershell
npm run cli -- version
npm run cli -- status
```

6. Abra o shell interativo:

```powershell
npm run cli
```

O prompt `career>` aparece. Digite `help` para ver os comandos.

## Onde ficam os dados

Com `CAREER_HOME=.` tudo fica na pasta do repo:

- `storage/jobs.sqlite` — vagas e aplicações
- `storage/profile_inbox/` — PDFs de currículo pendentes
- `storage/profile.draft.md` — rascunho gerado pelo `import --pdf`
- `src/config/profile.master.md` — perfil ativo aprovado
- `src/config/profile.master.json` — perfil compilado usado pela IA

## Comandos úteis em dev

```powershell
npm run dev              # mesmo que `npm run cli`
npm run cli -- status    # resumo do banco
npm run cli -- import --pdf cv.pdf
npm run cli -- review
npm run cli -- approve
npm run test:unit        # suite rápida
npm run test:integration # SQLite real
npx tsc --noEmit         # typecheck
```

## Próximo passo

Configure um modelo de IA: [04 — Configurando Ollama](04-configurando-ollama.md) ou [05 — IAs remotas](05-configurando-ias-remotas.md).
