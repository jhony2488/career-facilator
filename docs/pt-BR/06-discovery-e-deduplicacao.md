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

---

« [Anterior: Skills Dinâmicas](05-skills-dinamicas.md) | [Índice](README.md) | [Próximo: Modos de Candidatura →](07-modos-de-candidatura.md)
