# Tutorial 07 — Sequência sugerida de uso

Jornada recomendada para usar o CareerFacilator de ponta a ponta — da instalação à rotina diária. Cada etapa mostra o comando, o que conferir e onde ir se algo falhar.

## Mapa geral

```text
instalar → configurar IA → alimentar perfil → verificar descoberta
        → primeiro run (dry-run → real) → review/status → canais → rotina
```

## Etapa 0 — Instalar

Escolha um modo (todos usam a mesma CLI `career`):

- Repositório → [tutorial 01](01-instalacao-local-repositorio.md)
- npm global → [tutorial 02](02-instalacao-npm-global.md)
- Binário de release → [tutorial 03](03-instalacao-binario-release.md)

Sanidade: `career` abre o shell e `help` lista os comandos por seção.

## Etapa 1 — Configurar a IA

- Local (custo zero) → [tutorial 04 — Ollama](04-configurando-ollama.md)
- Nuvem → [tutorial 05 — provedores remotos](05-configurando-ias-remotas.md)

Confira com:

```powershell
career config check   # testa endpoint+modelo dos 3 tiers
```

O tier **LOCAL** precisa passar — é ele que faz a triagem. Opcional: embeddings para o match semântico (`AI_EMBEDDINGS_ENABLED=true` + `ollama pull nomic-embed-text`).

## Etapa 2 — Alimentar o perfil

```powershell
career import --pdf cv.pdf   # estrutura → profile.draft.md
```

1. Revise `storage/profile.draft.md` — nada entra no perfil sem vir de documento seu ou de edição manual (regra anti-fabricação).
2. Aprove: `career approve` → vira `profile.master.md` + JSON compilado.

Sem modelo configurado, o `import` gera só um rascunho mínimo — nesse caso, preencha `profile.master.md` direto.

## Etapa 3 — Verificar a descoberta (sem gastar IA)

```powershell
career discover --dry-run           # fontes ativas após os filtros DISCOVERY_*
career scan remoteok --max-jobs 2   # amostras de uma fonte
career discover --max-jobs 10       # lista vagas reais
```

Se vier pouco ou nada, ajuste `JOB_TITLES` e os filtros `DISCOVERY_*` — detalhes no [tutorial 06](06-descobrindo-vagas.md). Fontes `html` sem API/RSS usam o fallback LLM (herda o tier LOCAL).

## Etapa 4 — Primeira execução do funil

```powershell
career run --dry-run   # funil completo sem enviar nada
career run             # execução real (respeita EXECUTION_MODE)
```

Depois trabalhe a fila — no shell (`career` sem argumentos) o `review` pergunta o desfecho de cada item:

```powershell
career review                 # READY_TO_REVIEW, NEEDS_HUMAN_INPUT e fila WhatsApp
                              # (no shell: e=enviei web · m=e-mail · w=whatsapp · p=pular · f=falhou · x=excluir)
career mark <url> applied     # candidatura feita na mão vira APPLIED (email|whatsapp|skipped|failed|…)
career remove <url>           # tira a vaga do histórico — reprocessável no próximo run
career status                 # contagens por status no banco
```

Em `HYBRID_THRESHOLD`, vagas ≥ 88% vão sozinhas, ≥ 75% recebem material adaptado e ficam no `review`.

## Etapa 5 — Ligar os canais (opcional)

- **E-mail:** `career vault set smtp-main` (senha de app Gmail/Outlook) + `EMAIL_ENABLED=true` no `.env` — teto 45/dia. Guia completo em `docs/pt-BR/14-configurar-smtp-gmail-outlook.md`.
- **WhatsApp:** `WHATSAPP_ENABLED=true` + `career whatsapp setup` (QR no terminal). Default `MANUAL_QUEUE` — número+mensagem+PDF ficam no `review` para envio manual; confirme com `w` no review interativo ou `career mark <url> whatsapp` p/ ativar o cooldown do número. Doc 15.

## Etapa 6 — Rotina

```powershell
career import --inbox --watch   # opcional: solte PDFs novos na inbox
career run                      # ciclo de descoberta + funil
career review                   # trata o que ficou para humano
career status                   # métricas
```

Itere os filtros de descoberta (`JOB_TITLES`, `DISCOVERY_*`) conforme as vagas que aparecem — o tuning é o principal ajuste do dia a dia.

Próximo: [README](README.md) · [Descobrindo vagas](06-descobrindo-vagas.md)
