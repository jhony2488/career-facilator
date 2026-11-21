# Mecanismos de Confiabilidade e Resiliência

Cinco mecanismos que fecham o ciclo de ponta a ponta: Descoberta → Filtro Geográfico → Deduplicação → Triagem Otimizada → Skills → Geração de PDF → Preenchimento Multi-Etapas → Escalonamento Seguro → Tracking de Retorno.

## 1. Gestão de Sessão, Autenticação e Rate-Limit (`src/scraper/sessionVault.ts`)

**O problema:** Portais como LinkedIn, Gupy e Workday exigem login (ou criam contas temporárias durante a candidatura) e bloqueiam bots que fazem requisições rápidas demais.

**O que adicionar:**

- Persistência criptografada de cookies e `storageState` do Playwright (cofre = arquivo local AES-256-GCM com senha-mestra).
- **Fila com Jitter (Atraso Aleatório):** Limitar a execução a no máximo 1 candidatura a cada 3 a 8 minutos com variação aleatória, simulando comportamento humano real.
- **Rate-limit da plataforma (HTTP 429, desafio de velocidade):** a fila daquela fonte pausa com backoff exponencial; as demais fontes continuam processando normalmente.

## 2. Tratamento de Formulários Multi-Etapas (Wizards) e Shadow DOM (`src/autofill/wizardNavigator.ts`)

**O problema:** Plataformas como Workday, Gupy e Taleo não têm um único botão "Enviar" — elas dividem o cadastro em 4 a 6 telas seguidas (Dados Pessoais → Experiência → Perguntas → Revisão) e usam Shadow DOM ou iframes.

**O que adicionar:**

- Um loop de navegação por etapas que preenche a tela atual, clica em "Próximo / Next", aguarda a transição da DOM, valida se não surgiu nenhuma mensagem de erro de campo obrigatório em vermelho e repete até chegar na tela final de revisão/envio.
- **Implementado:** a inspeção (`pageInspector.snapshotScript`) é multi-frame — roda em cada `page.frames()` (atravessa iframe cross-origin) e recursa em shadow roots **abertos**, carimbando `frameIdx` em cada campo para o executor agir no escopo certo; botões de Next/submit são procurados em todos os frames. Sem `input[type=file]`, dropzones detectadas recebem o PDF via eventos `dragenter/dragover/drop` com `DataTransfer` (`playwrightExecutor.dropResumeViaDropzone`). Shadow roots **fechados** seguem opacos por design da plataforma.
- **Implementado:** página de vaga sem campos de formulário → `pageInspector.followApplyLink` procura link/botão de candidatura (texto "Apply/Candidate-se/…", **path terminando em `/apply`, `/bewerben`, `/postul`…** ou link para host de ATS conhecido), navega **1 hop** e re-inspeciona o destino — o formulário do ATS real é o que se preenche. Página com snapshot vazio aguarda `networkidle` (4 s) e reinspeciona, cobrindo widget/iframe tardio. Sem alvo encontrável, cai no canal de mensagem/`NEEDS_HUMAN_INPUT` como antes.

## 3. Detector de Bloqueios e Human Escalation (`src/core/escalationHandler.ts`)

**O problema:** Mesmo no modo FULL_AUTO, o sistema vai encontrar CAPTCHAs (Cloudflare Turnstile, reCAPTCHA), verificação de código por e-mail (2FA de criação de conta no Workday) ou perguntas dissertativas que não estão no currículo.

**O que adicionar:**

- Quando o robô detectar um CAPTCHA, OTP por e-mail ou campo obrigatório desconhecido, ele não falha nem inventa dados: muda o status da vaga para `NEEDS_HUMAN_INPUT`, salva o estado da aba e dispara um alerta na HUD/notificação para você conseguir se candidatar manualmente.
- **Timeout de espera humana:** se o bloqueio não for resolvido dentro do prazo configurado (`escalationTimeoutMinutes`), a aba é fechada e o estado serializado é mantido para retomada posterior — a candidatura segue na lista de pendências.
- **Circuit breaker por plataforma:** após N escalonamentos na mesma plataforma no dia (`maxEscalationsPerPlatformPerDay`), aquela fonte é pausada até o dia seguinte.

## 4. Rastreador Pós-Candidatura e Feedback Loop (`src/tracker/outcomeMonitor.ts`)

**O problema:** De nada adianta enviar 100 currículos sem saber qual versão de currículo ou qual Skill está convertendo em entrevistas.

**O que adicionar:**

- Leitura **opt-in** da caixa de entrada (IMAP/Gmail, acesso somente leitura) filtrando apenas remetentes das empresas aplicadas para atualizar automaticamente o status no SQLite (`APPLIED` → `REJECTED`, `ASSESSMENT_INVITED` ou `INTERVIEW`). Respostas do recrutador no mesmo thread ficam fora de escopo — o sistema não responde e-mails.
- **Classificação de respostas:** heurística determinística primeiro; modelo leve apenas para casos ambíguos. Status só muda automaticamente com confiança ≥ 0.8 — abaixo disso, a mensagem é sinalizada para conferência do usuário.
- Métrica de conversão por Skill e Fit Score (ex: descobrir que vagas onde você ativa a skill `ai-engineer` têm 3x mais retorno que `fullstack-ts` genérico).

## 5. Módulo de Dry-Run (Simulação Segura)

**O que adicionar:** Uma flag `--dry-run` no CLI que executa todo o funil (busca, deduplicação, cálculo de Fit Score, ativação de skills, geração do PDF sob medida e mapeamento dos campos da página), mas **não clica em Enviar**, permitindo calibrar a régua de Fit Score (85% vs 88%) antes de ligar o modo FULL_AUTO pela primeira vez.

---

« [Anterior: Configuração](09-configuracao.md) | [Índice](README.md) | [Próximo: Candidatura por E-mail →](11-candidatura-por-email.md)
