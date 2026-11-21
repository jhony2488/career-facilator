# Tutorial 06 — Descobrindo vagas (discovery)

O `run` executa descoberta de vagas quando você **não** passa `--jobs-file`. Este tutorial cobre os comandos `discover`, `scan`, o registro de fontes e o fallback genérico com LLM.

## 1. Listar as fontes ativas

```powershell
career discover --dry-run
```

Saída típica — as fontes públicas habilitadas por padrão:

```text
Fontes ativas (7):
  remoteok                 RemoteOK (api)
  remotive                 Remotive (api)
  jobicy                   Jobicy (api)
  arbeitnow                Arbeitnow (api)
  workingnomads            Working Nomads (api)
  himalayas                Himalayas (api)
  weworkremotely           We Work Remotely (rss)
```

O registro completo tem 145 fontes (boards BR/LATAM/EU/US, ATS, nicho, freelance). Fontes "risky" ou que exigem sessão ficam fora até você optar.

## 2. Descobrir vagas

```powershell
career discover                          # fontes ativas padrão, até 10 vagas
career discover --max-jobs 30            # até 30 vagas no total
career discover --sources remoteok,remotive
career discover --export jobs.json       # grava no formato que `run --jobs-file` aceita
```

## 3. Testar uma fonte isolada

```powershell
career scan remoteok --max-jobs 2
```

Mostra URL e um trecho da vaga — útil para conferir se a fonte responde e se os títulos batem com `JOB_TITLES`.

## 4. Descoberta dentro do funil

```powershell
career run                  # descobre vagas e roda o pipeline completo (triage, tailoring, aplicação)
career run --dry-run        # mesma coisa, sem enviar nada
career run --sources remoteok --max-jobs 20
career run --jobs-file jobs.json   # pula a descoberta e usa um arquivo [{url, html}]
```

## 5. Variáveis `DISCOVERY_*`

| Env                              | O que faz                                                                     | Default         |
| -------------------------------- | ----------------------------------------------------------------------------- | --------------- |
| `DISCOVERY_SOURCES`              | Allowlist de IDs (vazio = habilitadas)                                        | —               |
| `DISCOVERY_EXCLUDE_SOURCES`      | Remove IDs da execução                                                        | —               |
| `DISCOVERY_REGIONS`              | Filtra fontes por `BR,LATAM,PT,EU,US,GLOBAL,ASIA,OCEANIA`                     | —               |
| `DISCOVERY_WORK_MODELS`          | `REMOTE,HYBRID,ONSITE` — fontes remote-only ficam fora se você tirar `REMOTE` | `REMOTE,HYBRID` |
| `DISCOVERY_MAX_JOBS_PER_SOURCE`  | Teto por fonte                                                                | `20`            |
| `DISCOVERY_MAX_JOBS_PER_RUN`     | Teto global por execução                                                      | `100`           |
| `DISCOVERY_MIN_JOBS_PER_RUN`     | Meta de candidaturas enviadas; aquém dela o run expande a coleta              | `0` (off)       |
| `DISCOVERY_CONCURRENCY`          | Fontes em paralelo                                                            | `4`             |
| `DISCOVERY_PER_DOMAIN_DELAY_MS`  | Delay mínimo por domínio                                                      | `1500`          |
| `DISCOVERY_USE_GENERIC_FALLBACK` | Extrator LLM para fontes `html` sem API/RSS                                   | `true`          |
| `DISCOVERY_GENERIC_MODEL`        | Modelo do extrator — **vazio herda `AI_LOCAL_*`**                             | vazio           |

## 6. Fallback genérico (HTML + LLM)

Fontes `html` sem API/RSS passam pela extração assistida: a página vira Markdown e um modelo extrai `{title, url, company, location, description}`. Regras:

- Ative uma fonte `html` pela allowlist: `career discover --sources justremote` (fontes risky exigem opt-in).
- **Modelo:** `DISCOVERY_GENERIC_MODEL` preenchido usa esse ID; vazio herda `AI_LOCAL_PROVIDER`/`AI_LOCAL_MODEL`. Hoje só provider `ollama`.
- O log mostra o modelo resolvido: `Fallback genérico (HTML+LLM): ollama/llama3.2:3b — herdado de AI_LOCAL_*`.
- O prompt exige URLs reais e campos vazios para dados ausentes — a regra anti-fabricação se aplica aqui também.
- Fonte sem URL de listagem, sem fallback ou com falha de IA → erro registrado e o ciclo segue para as demais fontes.

## 7. Busca orgânica (dorks)

Fontes `search` pesquisam no buscador configurado — `DISCOVERY_SEARCH_ENGINE=duckduckgo|bing` (o outro vira fallback por query se o primário falhar/bloquear). IDs hoje:

- `searchdork` — plano de buscas por escopo (`dorkBuilder`): dorks `site:` de ATS (Greenhouse/Lever/Ashby) + buscas de agregadores.
- `linkedin-posts` — `site:linkedin.com/posts` + termos de vaga — **sem sessão, sem tocar sua conta**. Posts não usam título de vaga, então a fonte roda com `titleFilter` desligado.
- `linkedin-jobs` — `site:linkedin.com/jobs/view` — listagens públicas indexadas.

```powershell
career scan linkedin-posts --max-jobs 5
career discover --sources searchdork
```

Notas honestas: o `site:` às vezes é relaxado pelo buscador — o adapter filtra os hits pelo domínio real, então pode vir 0 quando não há nada indexado. Serp de buscador também muda de markup; falhas viram `DiscoveryError` e o ciclo segue.

## 8. Dicas

- `JOB_TITLES` controla o filtro de títulos em **todas** as fontes — ajuste antes de aumentar `--max-jobs`.
- `career run` aborta com alerta e sem chamar IA se **todas** as fontes falharem.
- Vagas descobertas passam pela deduplicação em 3 níveis (URL canônica, hash de conteúdo, cooldown de empresa) antes de qualquer chamada de IA.

Próximo: [README](README.md) · [Configurando IAs remotas](05-configurando-ias-remotas.md)
