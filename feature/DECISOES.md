# Pontos de Ambiguidade e Decisões

Consolidado das lacunas de requisito identificadas durante a escrita dos cenários BDD. Cada item também está comentado ao final do respectivo arquivo `.feature` — `# Ambiguidade:` enquanto aberto, `# Decisão:` após resolvido.

> **Nota geral:** os valores numéricos usados nos cenários (75/88 de Fit Score, 3–8 min de jitter, 30 dias de cooldown, 15 candidaturas/dia, máx. 2 skills) são os *defaults* citados na spec. Todos são configuráveis — os cenários tratam o comportamento relativo ao valor configurado, não o número em si.

## Por arquivo

### 01-discovery.feature
- [x] Comportamento quando **todas** as fontes falham na mesma execução. **Decisão:** abortar o ciclo com alerta ao usuário, sem consumir IA.
- [x] Volume máximo de vagas coletadas por execução. **Decisão:** limite configurável `maxJobsPerRun` (default 100).
- [x] Fontes sem API/listagem estruturada. **Decisão:** fallback assistido de extração (`DISCOVERY_USE_GENERIC_FALLBACK`); desabilitado → fonte ignorada com aviso, sem quebrar o ciclo.
- [x] Modelo do extrator genérico. **Decisão:** `DISCOVERY_GENERIC_MODEL` quando preenchido; vazio herda o tier leve já configurado (`AI_LOCAL_*`).
- [x] Motor de busca para as buscas estruturadas. **Decisão:** motor público configurável (`DISCOVERY_SEARCH_ENGINE` — `duckduckgo`|`bing`|`none`); o outro vira fallback por query quando o primário falha (ex.: anti-bot). `none` → fonte ignorada com aviso.
- [x] Links fora do domínio-alvo quando o buscador relaxa `site:`. **Decisão:** descartar — o adapter filtra hits pelo domínio declarado na dork.
- [x] Posts do LinkedIn (busca pública) no filtro de títulos. **Decisão:** configurável por fonte (`adapterConfig.titleFilter`) — `linkedin-posts` desliga, pois posts não usam título de vaga.

### 02-deduplicacao.feature
- [x] Critério de "conteúdo equivalente" no hash cross-platform. **Decisão:** normalizar o conteúdo antes do hash (lowercase, sem pontuação, espaços extras e boilerplate) sobre os 300 primeiros caracteres.
- [x] Cooldown por empresa se aplica a vagas `SKIPPED`? **Decisão:** não — conta apenas candidaturas efetivamente enviadas (`APPLIED`/`APPLIED_VIA_EMAIL`).

### 03-triagem-fit-score.feature
- [x] Política de fallback dos modelos de triagem. **Decisão:** modelo local → nuvem; falha total de todos os provedores → vaga vai para `NEEDS_HUMAN_INPUT`.
- [x] O Fit Score é recalculado se o perfil mestre for atualizado após a triagem? **Decisão:** sim — vagas em `TRIAGED` e `TAILORED` voltam para recálculo com o perfil novo.

### 04-skills-dinamicas.feature
- [x] Palavras-chave relevantes mas nenhuma skill na biblioteca. **Decisão:** a vaga segue sem contexto de skill e o sistema sugere a criação de uma nova ao usuário.
- [x] O limite de 2 skills é configurável ou fixo? **Decisão:** configurável (`maxSkillsPerJob`), default 2.

### 05-geracao-curriculo.feature
- [x] Destino da vaga quando a resposta dissertativa tem confiança baixa. **Decisão:** revisão humana, mesmo em `FULL_AUTO` — resposta incerta nunca é enviada.
- [x] O currículo base pode ser fallback quando a geração falha repetidamente? **Decisão:** sim — após N retentativas (configurável), usa o currículo-mestre puro com flag de revisão.

### 06-autofill-formulario.feature
- [x] Campo padronizado ausente no perfil (ex: pretensão salarial não configurada). **Decisão:** valor padrão configurável (`fieldDefaults`).
- [x] Critério que distingue "pergunta dissertativa conhecida" de "inédita". **Decisão:** similaridade de texto ≥ 90% com uma pergunta já respondida em cache.

### 07-modos-candidatura.feature
- [x] Default oficial de `minScoreForFullAuto`. **Decisão:** **88** (alinha com o exemplo de config da spec).
- [x] Candidatura abandonada em `READY_TO_REVIEW` por tempo indeterminado. **Decisão:** expira após prazo configurável (`reviewExpirationDays`, default 7) → `SKIPPED` com motivo registrado.

### 08-escopo-geografico.feature
- [x] Vaga que não declara região nem modelo de trabalho. **Decisão:** elegível, mas com flag de revisão — nunca enviada automaticamente.
- [x] Critério quantificado de sobreposição de fuso para `AMERICAS_TIMEZONE`. **Decisão:** faixa fixa **UTC-8 a UTC-3**.

### 09-escalonamento-humano.feature
- [x] Tempo máximo de espera por intervenção humana e manutenção da aba. **Decisão:** timeout configurável (`escalationTimeoutMinutes`, default 15 min); a aba é fechada e o estado serializado para retomada.
- [x] Circuit breaker para plataformas com escalonamentos repetidos. **Decisão:** sim — após N escalonamentos na mesma plataforma no dia (`maxEscalationsPerPlatformPerDay`, default 3), a fonte pausa até o dia seguinte.
- [x] Mitigação de bot-detection (reCAPTCHA/Turnstile disparando com frequência). **Decisão:** **prevenção, não bypass** — Chromium com stealth (`playwright-extra` + `puppeteer-extra-plugin-stealth`, `AUTOFILL_STEALTH`), viewport realista sorteado e ritmo humano nas interações (mouse em curva + digitação, `AUTOFILL_HUMAN_PACE`). CAPTCHA detectado continua escalando para `NEEDS_HUMAN_INPUT` — o sistema não resolve desafio por código.
- [x] CAPTCHA/OTP em modo headless é insolúvel na hora (sem janela). **Decisão:** **relaunch visível** — ao escalar em headless (`AUTOFILL_VISIBLE_ON_ESCALATION`, default on) o formulário reabre num browser visível no mesmo perfil, com campos refeitos; o usuário resolve e envia, confirmando depois com marcação manual. Páginas escaladas não são fechadas ao fim do run.

### 10-candidatura-email.feature
- [x] Número máximo de tentativas de reenvio e status final. **Decisão:** máx. 3 tentativas com backoff → `NEEDS_HUMAN_INPUT`.
- [x] Responder automaticamente a retornos do recrutador no mesmo thread. **Decisão:** fora de escopo — o sistema só envia e monitora.

### 11-sessao-rate-limit.feature
- [x] Mecanismo concreto do cofre no escopo standalone. **Decisão:** arquivo local criptografado **AES-256-GCM** com senha-mestra.
- [x] Comportamento sob rate-limit próprio da plataforma (HTTP 429, desafio de velocidade). **Decisão:** backoff exponencial + pausa da fila daquela fonte; demais fontes continuam.

### 12-tracking-e-dry-run.feature
- [x] Monitoramento de e-mail é opt-in ou opt-out? Escopos de acesso. **Decisão:** **opt-in**, acesso somente leitura (IMAP/Gmail read-only).
- [x] Mecanismo de classificação de respostas e confiança mínima. **Decisão:** heurística primeiro → LLM leve para ambíguos; confiança mínima **0.8** para mudar status automaticamente.
- [x] Desfecho recebido fora do monitoramento / pendência resolvida por fora do funil. **Decisão:** **marcação manual** — o usuário resolve pendências e registra resultados (`APPLIED`/`APPLIED_VIA_*`/`SKIPPED`/`FAILED`, desfechos `REJECTED`/`INTERVIEW`/`ASSESSMENT_INVITED`) e remove registros do histórico (URL volta a ser elegível no run).

### 13-ingestao-de-perfil.feature
- [x] Confiança mínima da extração. **Decisão:** trechos de baixa confiança entram no rascunho marcados para revisão.
- [x] Granularidade e retenção do histórico de versões do perfil-mestre. **Decisão:** snapshot a cada aprovação.
- [x] Efeito da atualização do perfil sobre candidaturas em `TAILORED`/`READY_TO_REVIEW`. **Decisão:** regenerar os materiais com o perfil novo.
- [x] Atualização do perfil recalcula Fit Scores pendentes? **Decisão:** sim — alinhado ao item de 03-triagem (recálculo de `TRIAGED`/`TAILORED`).

### 15-candidatura-whatsapp.feature
- [x] Modo padrão para vagas com candidatura por WhatsApp. **Decisão:** `MANUAL_QUEUE` — número + mensagem + PDF ficam na fila do `review` para envio manual; `EVOLUTION_API` exige configuração explícita.
- [x] Precedência quando a vaga oferece e-mail e WhatsApp. **Decisão:** web > e-mail > WhatsApp — o primeiro canal alcançável vence.
- [x] Falha no envio via Evolution API. **Decisão:** mesmo contrato do e-mail — retry transitório até 3× com backoff; esgotado → `NEEDS_HUMAN_INPUT`.
- [x] Confirmação do envio manual da fila. **Decisão:** o usuário confirma ao trabalhar a fila ou por marcação direta — a candidatura vira `APPLIED_VIA_WHATSAPP` e o cooldown por número passa a valer.

### 16-distribuicao-executavel.feature
- [x] Recursos que não cabem no binário single-file (navegadores, leitores de PDF/OCR, módulos com arquivos internos). **Decisão:** pasta de runtime sidecar `career-runtime/` ao lado do executável — nunca embutida; ausente → degradação segura para canais de mensagem/`NEEDS_HUMAN_INPUT`.
- [x] Local da configuração e dos dados no binário. **Decisão:** `.env` na pasta do executável vale acima do `.env` do diretório de trabalho (abaixo das variáveis de ambiente); `CAREER_HOME` relativo ancora na pasta do executável — modo portátil real.
- [x] Como completar o runtime em quem baixou só o binário. **Decisão:** comando da própria CLI `runtime setup` baixa `career-runtime-<os>-<arch>.tar.gz` do release da versão em uso; `runtime status` diagnostica. O ZIP completo segue como instalação recomendada.

## Nota sobre os testes (`__tests__/`)

As suites Jest em `__tests__/` usam assinaturas dos módulos `src/` centralizadas em `__tests__/helpers/contracts.ts`. Com a implementação em andamento, esse arquivo é o contrato mantido — divergências devem ser resolvidas lá primeiro.

## Padrões adotados

Valores e comportamentos confirmados em decisão — refletidos na config e nos cenários:

| # | Item | Padrão adotado |
|---|------|----------------|
| 1 | `minScoreForFullAuto` default | **88** |
| 2 | Falha total de fontes no discovery | Abortar ciclo com alerta, sem consumir IA |
| 3 | Cooldown por empresa | Contar apenas candidaturas enviadas (`APPLIED`/`APPLIED_VIA_EMAIL`) |
| 4 | Limite de skills | Configurável (`maxSkillsPerJob`), default 2 |
| 5 | Retry de e-mail | Máx. 3 tentativas com backoff; depois `NEEDS_HUMAN_INPUT` |
| 6 | Vaga sem região declarada (escopo internacional) | Elegível, com flag de revisão |
| 7 | Teto diário de e-mails | **45/dia** configurável (`EMAIL_MAX_DAILY`) |
| 8 | Canal WhatsApp default | `MANUAL_QUEUE` (fila no `review`); `EVOLUTION_API` opt-in |
| 9 | Precedência de canal | Web > e-mail > WhatsApp > `NEEDS_HUMAN_INPUT` |
| 10 | Fonte sem estrutura no discovery | Fallback assistido (`DISCOVERY_USE_GENERIC_FALLBACK`); desabilitado → ignora com aviso |
| 11 | Modelo do extrator genérico | `DISCOVERY_GENERIC_MODEL` ou, vazio, herda `AI_LOCAL_*` |
| 12 | Motor de busca orgânica | `DISCOVERY_SEARCH_ENGINE` (`duckduckgo`\|`bing`\|`none`) + fallback por query no outro motor |
| 13 | Resultados fora do `site:` alvo | Filtrar hits pelo domínio declarado na dork |
| 14 | Filtro de título em posts LinkedIn | `adapterConfig.titleFilter` — off em `linkedin-posts` |

| 15 | Página de vaga sem formulário | Segue link/botão de candidatura (1 hop, prefere host de ATS conhecido); sem destino, cai no canal de mensagem/revisão |

| 16 | Queries das APIs de discovery | Derivam da config (geo=DISCOVERY_REGIONS, count=limite/fonte, paginação automática) — sem env dedicado |
| 17 | URL carregada no pipeline | Link de candidatura da fonte (pply_url/pplicationLink/it.url) preferido sobre a página da listagem |

| 18 | Repos GitHub de vagas BR | Issues abertas via API pi (1 request/repo); labels mapeiam workModel/contractType; PRs ignorados |

| 19 | Providers remotos de IA | Adapter unico OpenAI-compatible (openaiCompatibleClient) cobre deepseek/groq/openai/kimi/openrouter/together + qualquer BASE_URL custom; Anthropic/Gemini nativos seguem sem adapter (Gemini func via endpoint compat do Google) |

| 20 | Link de candidatura com texto genérico | pickApplyTarget tambem avalia o path da URL (segmento /apply, /bewerben, /postul…) — portais 'company portal' viram canal web; iframe lazy ganha re-inspect pós-networkidle; tailor recebe resumeLanguage do scope (INTERNATIONAL → en-US) |

| 22 | Boards ATS por empresa | `DISCOVERY_ATS_BOARDS=provider:slug` (`greenhouse`/`lever`) — APIs públicas `boards-api.greenhouse.io` e `api.lever.co`; slug = empresa no board; demais providers seguem stub |
| 23 | LinkedIn autenticado | `linkedin`/`linkedin-br` com `renderText` da sessão (`career login linkedin`): jobs (`/jobs/search` + render `/jobs/view`) e posts de vagas (`/search/results/content/`, ≤10/título, gate "fala de vaga") |
| 24 | Contato em posts LinkedIn | e-mail/link/WhatsApp do texto; sem contato → OCR tesseract.js (por+eng, `DISCOVERY_POSTS_OCR`, ≤3 imgs/post); link externo vira url; post sem canal → `NEEDS_HUMAN_INPUT` (revisão) |
| 25 | Muro de login por subdomínio | Gupy exige sessão por `<empresa>.gupy.io` — cookie `.gupy.io` não basta: `vault set login-<domínio>` guarda {user,pass} cifrado e o signin é preenchido/submetido sozinho; falha ou ausência → fluxo manual (janela + Enter) |
| 26 | OTP por e-mail | `vault set imap-main` ({host,port,secure,user,pass}; `smtp-main` c/ gmail/outlook deriva o host): poll ~90s nas não-lidas do remetente, extrai código 4-8 dígitos p/ digitar no campo ou abre link de confirmação; sem caixa → fluxo manual |
| 27 | Reteste de candidaturas | `retry [url|id]` re-executa só o estágio web das vagas NEEDS_HUMAN_INPUT (`resumePath` persistido, `aiAnswers={}` — campos required desconhecidos escalam como UNKNOWN_REQUIRED_FIELD); comando dedicado, não flag no pipeline — sem recontagem de processed, dedup intacto, zero chamada de modelo |
| 28 | Snapshot de sessão no cofre | Gupy usa cookie de sessão (some ao fechar o browser — todo run pede login de novo em cada `<empresa>.gupy.io`). Após qualquer login bem-sucedido (cofre, código, magic link ou manual), os cookies do domínio vão p/ `session-<domínio>` no cofre; no muro, a sessão é restaurada ANTES de credencial/OTP — token válido entra sem login nem e-mail; cookies presos a host são re-escopados p/ `.<domínio>` (serve outros subdomínios quando o token é central) |
| 29 | Navegação agêntica até o form | Quando a cadeia determinística (followApplyChain ≤10 hops) não acha form, um agente no tier SMART escolhe 1 ação por passo (goto url \| click texto \| stop — JSON forçado, ≤8 passos, 120s) olhando os clickables da página. Só NAVEGA — nunca digita/submete; a chegada é detectada por inspeção (campos ou dropzone), não pela fala do modelo. Falha = NEEDS_HUMAN_INPUT como antes (ganho puro). `AUTOFILL_AGENT_NAV=false` desliga |
| 30 | Respostas persistidas + envio no retry | As respostas do tailor vão p/ sidecar `<resume>.answers.json` — o retry preenche os mesmos campos do run (antes `aiAnswers={}` deixava tudo vazio). Match por seletor (não só label — labels duplicadas não cruzam valores); CV anexa no input file resume-ish (foto/avatar fora), c/ fallback p/ master_resume. Envio: `retry --send` (ou FULL_AUTO) → AUTO_SUBMIT; campo REQUIRED respondido só por IA = baixa confiança → pausa mesmo no auto (anti-fabricação). `AUTOFILL_DEBUG_FILL` loga campo→valor→fonte |
| 31 | Diagnóstico real + robustez no fill/submit | `career inspect <url>` abre a página e imprime campos, matches, dropzones, botões candidatos e sinais — sem preencher. Fill usa `force`/fallback de select, `setInputFiles` em input file (mesmo oculto) e click em dropzone antes do drop. Submit detecta `<button>` sem type, links e aria-label. Fuzzy lookup (limiar `autofill.questionSimilarityThreshold`) e `fieldDefaults` cobrem campos obrigatórios com variantes de label. `retry --send` para no primeiro não-`APPLIED` para não passar para a próxima sem enviar |
| 21 | Listagem SPA sem API publica | Fonte 
ender: true e renderizada em browser persistente — o mesmo do autofill (AUTOFILL_PROFILE_DIR, ou DISCOVERY_BROWSER_PROFILE_DIR se setado): um login manual serve p/ descobrir e preencher; gupy roda por acesso direto, sem api.gupy.io |
| 32 | Navegação interativa no LinkedIn | `renderPage` (mesma sessão do renderText) executa `interact` na página viva — scroll do feed (`DISCOVERY_SCROLL_MAX`, default 5) + clique "ver mais" para expandir posts/descrições truncadas; `geoId`/`f_WT` na busca vem de `DISCOVERY_REGIONS`/`DISCOVERY_WORK_MODELS` (GLOBAL = remoto mundial, sem geoId); encurtadores (`lnkd.in`, `bit.ly`…) de posts são seguidos no browser e a URL final vira a candidatura (listagem resolvida é descartada) |
| 33 | Easy Apply LinkedIn | Vaga `linkedin.com/jobs/view|collections` sem form à vista → `openEasyApplyModal` clica "Candidatura simplificada"/"Easy Apply" e o wizard multi-etapas entra no mesmo loop de wizard (Avançar/Revisar = navegação de etapa, Enviar candidatura = submit); submit só sob o modo configurado; pergunta desconhecida/CAPTCHA → `NEEDS_HUMAN_INPUT` |
| 34 | Runtime do executável | `career-runtime/` ao lado do binário — `node_modules` (playwright*/stealth, pdf-parse, tesseract.js) + `browsers/` + `tessdata/`; carregado por `createRequire` via `src/utils/runtimeModules.ts`; `CAREER_RUNTIME` sobrescreve o local; sem ele → degradação p/ mensagens/revisão |
| 35 | Config e dados portáteis | `.env` na pasta do exe entra na cadeia (`<home>/.env` < `./.env` < `<exe>/.env` < env); `CAREER_HOME` relativo ancora no dir do exe — dados ao lado do binário, de qualquer cwd |
| 36 | Distribuição | `career-<os>-<arch>.zip` completo (exe + runtime + skills + .env.example) é a instalação recomendada; binário solto + `career runtime setup` baixa `career-runtime-<os>-<arch>.tar.gz` do release como alternativa |

| 37 | Interface grafica | Dashboard web local embutido no binario (`career ui`) + app desktop Tauri separado (`career-ui-<os>-<arch>`) — servidor node:http em 127.0.0.1 + token de sessao; comandos viram subprocessos do proprio binario com stdout SSE e stdin alimentavel (paridade total com o CLI); env mascarado+fonte, vault so refs, tasks sem ui/serve/repl |
| 38 | PDF do currículo materializado | `tailorResume` só nomeava `storage/generated_resumes/<job>.pdf` — ninguém escrevia o arquivo, e o anexo no form caía no seletor nativo. Agora o pipeline gera PDF real via `generator/pdfWriter` (PDF 1.4 em JS puro, base-14 Helvetica, coluna única = ATS-safe — sem Chromium, funciona até no binário solto), path absoluto sob o home de dados, persistido em `jobs.resume_path` p/ o retry reanexar. Markdown vazio do modelo → `fallbackResumeMarkdown` (só campos do perfil — anti-fabricação); falha de gravação → `NEEDS_HUMAN_INPUT` 'RESUME_PDF_FAILED' |
| 39 | Perguntas do form sem resposta por nenhuma fonte | Campos que perfil determinístico, respostas do tailor e `fieldDefaults` não cobrem vão ao tier SMART em 1 chamada batelada por etapa do wizard — o perfil (RAG) é a única fonte permitida e `""` = segue p/ humano. Required respondida só aqui derruba AUTO_SUBMIT p/ pausa (anti-fabricação); respostas usadas entram no sidecar `<resume>.answers.json` (retry reusa); o que sobrar required sem resposta vira `UNKNOWN_REQUIRED_FIELD` e reabre o form visível listando as perguntas pendentes. Radios agrupados por `name` viram um campo `choice` (label = pergunta; a resposta resolve a opção — exata→contenção→fuzzy→sim/não). `AUTOFILL_LIVE_ANSWERS=false` desliga |
