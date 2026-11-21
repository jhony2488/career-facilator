# Discovery Engine e Deduplicação

O sistema opera nos dois modos de descoberta combinados (e não apenas jogando termos aleatórios no Google) para não perder vagas nem desperdiçar processamento.

## 1. Como funciona a busca e extração de vagas (Discovery Engine)

- **Varredura Direta em Portais e APIs Ocultas (Preferencial — Mais Rápido e Limpo):** Plataformas como Greenhouse, Lever, Ashby, Workable e Gupy possuem endpoints JSON públicos ou estruturas HTML padronizadas por empresa. O scraper consulta diretamente as URLs cadastradas ou buscas filtradas nesses portais (ex: `boards.greenhouse.io/empresa`), extraindo a vaga sem precisar navegar por páginas cheias de anúncios.
- **Busca via Google Dorks / Motores de Busca (Descoberta Aberta):** Para encontrar empresas novas que não estão na sua lista fixa, o sistema executa buscas estruturadas (ex: `site:jobs.lever.co "TypeScript" "Remote"` ou `site:boards.greenhouse.io "Full Stack"`) usando APIs de busca (como Serper/Brave Search) ou Playwright, coletando apenas os links diretos das vagas abertas e ignorando blogs ou agregadores de spam.
- **LinkedIn / Agregadores (Com Sessão Persistente):** Usa um perfil persistente do Playwright (já autenticado) para varrer alertas salvos com filtros rígidos (ex: Últimas 24h, Remoto), extraindo apenas o card da vaga.

## 2. Como ele evita se candidatar duas vezes (Deduplicação em 3 Níveis)

Antes mesmo de gastar 1 único token de IA, o repositório (`src/db/repository.ts`) bloqueia vagas repetidas usando três camadas de verificação no SQLite:

1. **Bloqueio por URL Canônica (Exact Match):** Limpa parâmetros de rastreamento da URL (como `?utm_source=...&ref=...`) e verifica se o link base já existe na tabela `jobs`. Se já existir, descarta em 0ms.
2. **Bloqueio por Hash de Conteúdo (Cross-Platform Deduplication):** Muitas empresas postam a mesma vaga no LinkedIn, no Greenhouse e na Gupy ao mesmo tempo. O sistema gera um hash SHA-256 combinando `empresa_normalizada + titulo_normalizado + primeiros_300_caracteres`. Se você já se candidatou no LinkedIn, ele ignora automaticamente a cópia na Gupy.
3. **Cooldown por Empresa (Regra de Negócio):** Verifica no histórico se você já aplicou para aquela mesma empresa nos últimos X dias (ex: 30 dias), evitando disparar múltiplos currículos para a mesma recrutadora no mesmo mês.

## 3. Como funciona o Ciclo Completo de Candidatura

```text
[ Busca Direta (ATS) + Google Dorks ]
                │
                ▼
[ Checagem no SQLite: URL ou Hash já existe? ] ──(SIM)──► [ Descarta (0 tokens) ]
                │ (NÃO - Vaga Inédita)
                ▼
[ Triagem IA (Fit Score >= 75%) + Ativação de Skills ]
                │
                ▼
[ Gera Currículo PDF Sob Medida + Preenche Formulário ]
                │
                ▼
[ Pausa para Revisão (Human-in-the-Loop) -> Envio -> Grava Status "APPLIED" ]
```

- **Gravação do Histórico:** Assim que a candidatura é enviada (ou pulada por baixo Fit Score), o SQLite grava a data, a URL, o hash, a versão exata do PDF enviado, as skills ativadas e o status (`APPLIED`, `SKIPPED`, `INTERVIEW`, `REJECTED`).
- **Detecção Visual na Página:** Além do banco local, se o scraper abrir uma vaga no LinkedIn ou Gupy e detectar elementos nativos da própria plataforma como "Candidatura enviada há 2 dias", ele sincroniza automaticamente o status para `APPLIED` no banco e aborta o fluxo.

## 4. Fontes e comandos implementados

- **APIs JSON públicas (habilitadas):** `remoteok`, `remotive`, `jobicy`, `arbeitnow`, `workingnomads`, `himalayas`, além de `weworkremotely` (RSS). Rodam em `src/discovery/adapters/apiAdapter.ts`/`rssAdapter.ts` e produzem `RawJobInput` (`{url, html}`) para o pipeline.
- **Registro de fontes:** `src/discovery/registry.ts` mantém 100+ fontes/ATS/job boards; `getActiveSources` em `src/discovery/sourceRegistry.ts` aplica filtros `DISCOVERY_*` (allowlist, exclusão, regiões, modelo de trabalho, risky/auth).
- **CLI:** `career run` (sem `--jobs-file`) executa descoberta; `career discover [--sources id1,id2] [--max-jobs N] [--export out.json]` lista ou exporta vagas; `career scan <source-id> [--max-jobs N]` testa uma fonte. `--dry-run` em `discover` lista fontes ativas sem buscar.
- **Isolamento de erro:** uma fonte que falha retorna `DiscoveryError` e o motor segue nas demais; se todas falham, o ciclo alerta e aborta sem tocar nos tiers de IA.
- **Limites/rate:** `DISCOVERY_MAX_JOBS_PER_SOURCE`, `DISCOVERY_CONCURRENCY`, `DISCOVERY_PER_DOMAIN_DELAY_MS`, `MAX_JOBS_PER_RUN` (global).
- **Fallback genérico (HTML + LLM):** fontes `html` com `url`/`searchUrlTemplate` usam `src/discovery/adapters/htmlAdapter.ts` + `genericExtractor.ts` — a página vira Markdown (`cleanJobHtml`) e um modelo extrai `{"jobs": [...]}` via `generateStructured`. Requer `DISCOVERY_USE_GENERIC_FALLBACK=true`; o modelo é `DISCOVERY_GENERIC_MODEL` ou, se vazio, herda o tier `AI_LOCAL_*` (hoje só provider `ollama`). Nada é inventado: o prompt exige URLs reais e campos ausentes ficam vazios.
- **Busca orgânica (dorks):** fontes `search` rodam `src/discovery/adapters/searchAdapter.ts` — `DISCOVERY_SEARCH_ENGINE` = `duckduckgo` | `bing` (o outro vira fallback por query quando o primário falha, ex.: 202 do DDG). Cada fonte traz `adapterConfig.dorkTemplates` (`{query}` → termos de `JOB_TITLES`) ou usa o plano por escopo de `dorkBuilder.ts`. Dorks com `site:` filtram os hits pelo domínio real — engines relaxam o operador às vezes. `adapterConfig.titleFilter: false` desliga o filtro de título (posts do LinkedIn não usam título de vaga). Fontes: `searchdork` (plano por escopo — ATS + agregadores), `linkedin-posts` e `linkedin-jobs` (site:dorks públicas do LinkedIn, sem sessão).
- **Não implementado ainda:** boards ATS por slug de empresa (Greenhouse/Lever/Gupy) e LinkedIn com sessão autenticada estão registrados, mas retornam erro `not implemented` até os adapters existirem.

---

« [Anterior: Skills Dinâmicas](05-skills-dinamicas.md) | [Índice](README.md) | [Próximo: Modos de Candidatura →](07-modos-de-candidatura.md)
