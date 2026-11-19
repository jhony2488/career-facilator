# 9. Modos de Candidatura (FULL_AUTO vs. SEMI_AUTO) e Régua de Aderência

Para permitir que o sistema se candidate de forma 100% autônoma sem disparar currículos para vagas mediocres, adicionamos o **Motor de Decisão de Autonomia** (`src/core/autonomyEngine.ts`) governado por uma régua de Fit Score rigorosa.

## 9.1. Níveis de Automação Configuráveis

- **FULL_AUTO (Piloto Automático Total):**
  - O sistema busca as vagas, calcula a aderência real com o currículo, gera o PDF adaptado, preenche o formulário e clica no botão de envio sozinho, registrando tudo no SQLite e notificando na HUD/Terminal.
  - **Trava de Segurança:** No modo FULL_AUTO, o sistema exige um Fit Score muito mais alto (ex: ≥ 85%) e bloqueia envio automático caso a página exija resolução de CAPTCHA complexo ou perguntas inéditas com baixa confiança da IA.
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

---

« [Anterior: Discovery e Deduplicação](06-discovery-e-deduplicacao.md) | [Índice](README.md) | [Próximo: Escopo Geográfico →](08-escopo-geografico.md)
