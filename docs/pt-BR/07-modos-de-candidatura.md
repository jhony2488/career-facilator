# 9. Modos de Candidatura (FULL_AUTO vs. SEMI_AUTO) e Régua de Aderência

Para permitir que o sistema se candidate de forma 100% autônoma sem disparar currículos para vagas mediocres, adicionamos o **Motor de Decisão de Autonomia** (`src/core/autonomyEngine.ts`) governado por uma régua de Fit Score rigorosa.

## 9.1. Níveis de Automação Configuráveis

- **FULL_AUTO (Piloto Automático Total):**
  - O sistema busca as vagas, calcula a aderência real com o currículo, gera o PDF adaptado, preenche o formulário e clica no botão de envio sozinho, registrando tudo no SQLite e notificando na HUD/Terminal.
  - **Trava de Segurança:** No modo FULL_AUTO, o sistema exige um Fit Score muito mais alto (default: ≥ 88%) e bloqueia envio automático caso a página exija resolução de CAPTCHA complexo ou perguntas inéditas com baixa confiança da IA.
- **SEMI_AUTO (Revisão Antes do Envio):**
  - Faz todo o trabalho pesado (busca, triagem, PDF customizado e preenchimento completo do formulário), mas pausa antes do botão Submit aguardando sua aprovação visual.
- **HYBRID_THRESHOLD (Recomendado):**
  - Vagas com aderência altíssima (≥ 88%) são enviadas em FULL_AUTO imediatamente; vagas boas (75% a 87%) ficam na fila de revisão rápida (SEMI_AUTO).

## 9.2. Como o Sistema Garante que a Vaga é Realmente Boa para Você

Antes de autorizar uma candidatura automática, o `triageAgent.ts` cruza o `profile.master.json` (perfil-mestre compilado a partir do MD aprovado — ver [Ingestão de Perfil](13-ingestao-de-perfil.md)) contra a descrição da vaga em **4 eixos ponderados**:

| Eixo | Peso | Descrição |
|------|------|-----------|
| **Stack Técnica Principal** | 40% | Exige match nas tecnologias centrais do seu currículo (ex: TypeScript, Next.js, Node.js, PostgreSQL), penalizando vagas onde sua stack é apenas secundária. |
| **Senioridade e Escopo Real** | 25% | Valida anos de experiência exigidos e responsabilidades (evita aplicar para vagas de estágio/júnior ou diretoria incompatíveis). |
| **Alinhamento de Projetos e Domínio** | 20% | Verifica via embeddings locais se os sistemas que você já construiu (ex: SaaS, dashboards financeiros, automações com IA) resolvem problemas parecidos com os da vaga. |
| **Zero Dealbreakers** | 15% | Bloqueio determinístico de restrições eliminatórias (ex: "Must reside in US with Green Card" ou modelo 100% presencial fora da sua cidade). |

## 9.3. Fila de revisão: processar agora, aprovar depois

Nada precisa ser decidido durante o `run` — os modos de revisão existem justamente para você aprovar as candidaturas **depois** que o trabalho pesado termina:

- **`SEMI_AUTO` pausa tudo.** O motor roteia 100% das vagas para `REVIEW`, qualquer que seja o Fit Score. O sistema descobre, tria, gera o CV adaptado e preenche o formulário — mas para no `PAUSE_BEFORE_SUBMIT`: a vaga fica `READY_TO_REVIEW` no `jobs.sqlite` (ou `NEEDS_HUMAN_INPUT` quando a página exige CAPTCHA, login ou campo desconhecido). Nada é submetido sozinho.
- **`HYBRID_THRESHOLD` (default) já é meio caminho.** Só vagas com fit ≥ 88% (`minScoreForFullAuto`) saem sozinhas; todo o resto cai na mesma fila de revisão. E resposta de campo obrigatório vinda só da IA conta como baixa confiança — força revisão até em `FULL_AUTO`.
- **Comandos de revisão:** no shell `career` (ou direto: `career review`), `review` percorre `READY_TO_REVIEW` + `NEEDS_HUMAN_INPUT` + a fila do WhatsApp perguntando o desfecho de cada item; `retry --send <url|id>` refaz o preenchimento e submete; `mark <url|id> <status>` registra o desfecho manual (`applied`, `skipped`, `rejected`…); `status` mostra as contagens por estado; `remove <url|id>` tira a vaga do histórico para reprocessar.

Sequência típica "pesquisar agora, revisar depois": `career config set EXECUTION_MODE SEMI_AUTO` → `career run` → `career review` quando houver tempo.

---

« [Anterior: Discovery e Deduplicação](06-discovery-e-deduplicacao.md) | [Índice](README.md) | [Próximo: Escopo Geográfico →](08-escopo-geografico.md)
