# Pontos de Ambiguidade e Decisões

Consolidado das lacunas de requisito identificadas durante a escrita dos cenários BDD. Cada item também está comentado ao final do respectivo arquivo `.feature` — `# Ambiguidade:` enquanto aberto, `# Decisão:` após resolvido.

> **Nota geral:** os valores numéricos usados nos cenários (75/88 de Fit Score, 3–8 min de jitter, 30 dias de cooldown, 15 candidaturas/dia, máx. 2 skills) são os *defaults* citados na spec. Todos são configuráveis — os cenários tratam o comportamento relativo ao valor configurado, não o número em si.

## Por arquivo

### 01-discovery.feature
- [x] Comportamento quando **todas** as fontes falham na mesma execução. **Decisão:** abortar o ciclo com alerta ao usuário, sem consumir IA.
- [x] Volume máximo de vagas coletadas por execução. **Decisão:** limite configurável `maxJobsPerRun` (default 100).
- [x] Fontes sem API/listagem estruturada. **Decisão:** fallback assistido de extração (`DISCOVERY_USE_GENERIC_FALLBACK`); desabilitado → fonte ignorada com aviso, sem quebrar o ciclo.
- [x] Modelo do extrator genérico. **Decisão:** `DISCOVERY_GENERIC_MODEL` quando preenchido; vazio herda o tier leve já configurado (`AI_LOCAL_*`).

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

### 10-candidatura-email.feature
- [x] Número máximo de tentativas de reenvio e status final. **Decisão:** máx. 3 tentativas com backoff → `NEEDS_HUMAN_INPUT`.
- [x] Responder automaticamente a retornos do recrutador no mesmo thread. **Decisão:** fora de escopo — o sistema só envia e monitora.

### 11-sessao-rate-limit.feature
- [x] Mecanismo concreto do cofre no escopo standalone. **Decisão:** arquivo local criptografado **AES-256-GCM** com senha-mestra.
- [x] Comportamento sob rate-limit próprio da plataforma (HTTP 429, desafio de velocidade). **Decisão:** backoff exponencial + pausa da fila daquela fonte; demais fontes continuam.

### 12-tracking-e-dry-run.feature
- [x] Monitoramento de e-mail é opt-in ou opt-out? Escopos de acesso. **Decisão:** **opt-in**, acesso somente leitura (IMAP/Gmail read-only).
- [x] Mecanismo de classificação de respostas e confiança mínima. **Decisão:** heurística primeiro → LLM leve para ambíguos; confiança mínima **0.8** para mudar status automaticamente.

### 13-ingestao-de-perfil.feature
- [x] Confiança mínima da extração. **Decisão:** trechos de baixa confiança entram no rascunho marcados para revisão.
- [x] Granularidade e retenção do histórico de versões do perfil-mestre. **Decisão:** snapshot a cada aprovação.
- [x] Efeito da atualização do perfil sobre candidaturas em `TAILORED`/`READY_TO_REVIEW`. **Decisão:** regenerar os materiais com o perfil novo.
- [x] Atualização do perfil recalcula Fit Scores pendentes? **Decisão:** sim — alinhado ao item de 03-triagem (recálculo de `TRIAGED`/`TAILORED`).

### 15-candidatura-whatsapp.feature
- [x] Modo padrão para vagas com candidatura por WhatsApp. **Decisão:** `MANUAL_QUEUE` — número + mensagem + PDF ficam na fila do `review` para envio manual; `EVOLUTION_API` exige configuração explícita.
- [x] Precedência quando a vaga oferece e-mail e WhatsApp. **Decisão:** web > e-mail > WhatsApp — o primeiro canal alcançável vence.
- [x] Falha no envio via Evolution API. **Decisão:** mesmo contrato do e-mail — retry transitório até 3× com backoff; esgotado → `NEEDS_HUMAN_INPUT`.

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
