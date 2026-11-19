# Pontos de Ambiguidade e Decisões Pendentes

Consolidado das lacunas de requisito identificadas durante a escrita dos cenários BDD. Cada item também está comentado (`# Ambiguidade:`) ao final do respectivo arquivo `.feature`.

> **Nota geral:** os valores numéricos usados nos cenários (75/88 de Fit Score, 3–8 min de jitter, 30 dias de cooldown, 15 candidaturas/dia, máx. 2 skills) são os *defaults* citados na spec. Todos são configuráveis — os cenários tratam o comportamento relativo ao valor configurado, não o número em si.

## Por arquivo

### 01-discovery.feature
- [ ] Comportamento quando **todas** as fontes falham na mesma execução (abortar com alerta? retry agendado?).
- [ ] Volume máximo de vagas coletadas por execução (há limite diário de *candidaturas*, não de *descobertas*).

### 02-deduplicacao.feature
- [ ] Critério exato de "conteúdo equivalente" no hash cross-platform — portais podem resumir a descrição de formas diferentes, quebrando o match dos 300 primeiros caracteres.
- [ ] O cooldown por empresa se aplica a vagas `SKIPPED` ou apenas a candidaturas efetivamente enviadas?

### 03-triagem-fit-score.feature
- [ ] Política de fallback dos modelos de triagem (nº de tentativas, status da vaga quando todos os provedores falham).
- [ ] O Fit Score é recalculado se o perfil mestre for atualizado após a triagem?

### 04-skills-dinamicas.feature
- [ ] Comportamento quando há palavras-chave relevantes mas nenhuma skill na biblioteca (sugerir criação ao usuário? seguir sem contexto?).
- [ ] O limite de 2 skills é configurável ou fixo?

### 05-geracao-curriculo.feature
- [ ] Destino da vaga quando a resposta dissertativa gerada tem confiança baixa (revisão humana vs. envio em FULL_AUTO).
- [ ] O currículo base (não adaptado) pode ser fallback quando a geração falha repetidamente?

### 06-autofill-formulario.feature
- [ ] Comportamento para campo padronizado ausente no perfil (ex: pretensão salarial não configurada) — vazio, escalonar ou valor padrão?
- [ ] Critério que distingue "pergunta dissertativa conhecida" (resposta em cache) de "inédita" (nova geração).

### 07-modos-candidatura.feature
- [ ] **Decisão pendente:** o texto cita trava "≥85%" para FULL_AUTO, mas o exemplo de config usa 88 — definir o default oficial de `minScoreForFullAuto`.
- [ ] Candidatura abandonada em `READY_TO_REVIEW` por tempo indeterminado — expira, é reenfileirada ou fica indefinidamente?

### 08-escopo-geografico.feature
- [ ] Vaga que não declara região nem modelo de trabalho — assume elegível, marca para revisão ou descarta?
- [ ] Critério quantificado de sobreposição de fuso para `AMERICAS_TIMEZONE`.

### 09-escalonamento-humano.feature
- [ ] Tempo máximo de espera por intervenção humana e como a aba é mantida (aberta vs. estado serializado).
- [ ] Circuit breaker para plataformas com escalonamentos repetidos?

### 10-candidatura-email.feature
- [ ] Número máximo de tentativas de reenvio e status final se todas falharem (`NEEDS_HUMAN_INPUT`? `FAILED`?).
- [ ] Responder automaticamente a retornos do recrutador no mesmo thread está fora de escopo — confirmar.

### 11-sessao-rate-limit.feature
- [ ] **Decisão pendente:** mecanismo concreto do cofre no escopo standalone (a spec referencia um "Monarch OS" externo; opções: arquivo local AES-256-GCM, gerenciador de credenciais do SO, ou integração externa).
- [ ] Comportamento quando a plataforma aplica rate-limit próprio (HTTP 429, desafio de velocidade) durante a fila.

### 12-tracking-e-dry-run.feature
- [ ] Monitoramento de e-mail é opt-in ou opt-out? Quais escopos de acesso (IMAP/Gmail API) são exigidos?
- [ ] Mecanismo de classificação de respostas (IA vs. heurística) e confiança mínima para mudar status automaticamente.

### 13-ingestao-de-perfil.feature
- [ ] Confiança mínima da extração: trechos reconhecidos com baixa confiança entram no rascunho marcados ou são omitidos?
- [ ] Granularidade e retenção do histórico de versões do perfil-mestre (a cada aprovação? a cada importação?).
- [ ] Efeito da atualização do perfil sobre candidaturas já em `TAILORED`/`READY_TO_REVIEW` geradas com a versão antiga — regenerar, manter ou sinalizar?
- [ ] Atualização do perfil recalcula Fit Scores pendentes? (Conecta-se à ambiguidade já aberta em 03-triagem-fit-score.)

## Nota sobre os testes (`__tests__/`)

As suites Jest em `__tests__/` usam **assinaturas provisórias** dos módulos `src/`, centralizadas em `__tests__/helpers/contracts.ts`. Elas representam a leitura mais plausível da spec, mas são um contrato a confirmar quando a implementação começar — divergências devem ser resolvidas naquele arquivo primeiro.

## Sugestões de padrão a confirmar

| # | Item | Sugestão |
|---|------|----------|
| 1 | `minScoreForFullAuto` default | 88 (alinha com o exemplo de config da spec) |
| 2 | Falha total de fontes no discovery | Abortar ciclo com alerta, sem consumir IA |
| 3 | Cooldown por empresa | Contar apenas candidaturas enviadas (`APPLIED`/`APPLIED_VIA_EMAIL`) |
| 4 | Limite de skills | Configurável, default 2 |
| 5 | Retry de e-mail | Máx. 3 tentativas com backoff; depois `NEEDS_HUMAN_INPUT` |
| 6 | Vaga sem região declarada (escopo internacional) | Elegível, com flag de revisão em `SEMI_AUTO` |
