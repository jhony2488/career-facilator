# Módulo de Candidatura por E-mail (`src/email_application/`)

**Detecção de Fluxo por E-mail, Redação Otimizada com LLM/Prompt Caching, Anexo de Currículo Sob Medida e Disparo Seguro para o CareerFacilator AI**

## 1. Visão Geral do Módulo

Nem toda oportunidade possui um formulário web ou portal ATS direto: muitas empresas, startups e recrutadores solicitam que o candidato envie o currículo e a apresentação diretamente para um endereço de e-mail (ex: `vagas@empresa.com`, `rh@...` ou `careers@...`).

O módulo `email_application` entra em ação quando a etapa de inspeção de formulário não encontra um fluxo de candidatura web direto e identifica um canal de envio por e-mail. Ele aproveita o currículo já adaptado (PDF/DOCX) e a skill ativa da vaga para montar uma mensagem curta, objetiva e contextualizada, respeitando regras de revisão humana, deduplicação e segurança de credenciais armazenadas no cofre.

## 2. Arquitetura de Envio de Currículo por E-mail

```text
[ Vaga Aprovada (Sem Formulário Web Direto / E-mail de Contato Detectado) ]
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│             ORQUESTRADOR DE CANDIDATURA POR E-MAIL                      │
│  • Validação de Destinatário & Domínio • Deduplicação por E-mail/Vaga   │
│  • Recuperação de Credenciais SMTP/API via Cofre (AES-256-GCM)          │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│             GERADOR DE CORPO & ASSUNTO (LLM + PROMPT CACHING)           │
│  • Usa Perfil + Skill Ativa + Resumo da Vaga (Economia de Tokens)       │
│  • Produz Assunto Direto + Corpo Curto + Anexo (CV Adaptado)            │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│         GATE DE AUTONOMIA (SEMI_AUTO vs. FULL_AUTO) & DISPARO           │
│  • Pausa na HUD/CLI para Revisão (se exigido) • Envio via SMTP/API      │
│  • Registro no SQLite (status: APPLIED_VIA_EMAIL) & Fila/Retry          │
└─────────────────────────────────────────────────────────────────────────┘
```

## 3. Componentes e Submódulos

### 3.1. Detector e Validador de Destinatário (`recipientResolver.ts`)

- **Extração do E-mail Alvo:** Localiza endereços de recrutamento ou contato no texto da vaga, página de carreiras ou metadados da oportunidade, priorizando caixas ligadas a vagas/talentos em vez de e-mails genéricos sem relação quando houver múltiplas opções.
- **Sanitização e Anti-Duplicidade:** Verifica no banco local se já houve envio para aquele mesmo endereço/vaga dentro do período de cooldown, evitando disparos repetidos para a mesma caixa de entrada.

### 3.2. Compositor de Mensagem e Anexo (`emailComposer.ts`)

- **Injeção de Contexto Econômica:** Reutiliza o resumo da vaga, o Fit Score e a skill já selecionada (ex: `fullstack-ts`, `ai-engineer` ou `international-remote`), evitando reprocessar o histórico bruto inteiro.
- **Assunto e Corpo Sob Medida:** Gera um assunto claro (ex: referência ao cargo e área), um texto curto com os pontos mais aderentes ao requisito e vincula automaticamente o arquivo do currículo adaptado gerado para aquela candidatura.
- **Adaptação de Idioma:** Redige o e-mail em PT-BR para o escopo nacional ou EN-US para o escopo internacional, mantendo coerência com o currículo anexado.

### 3.3. Controlador de Autonomia e Disparo (`emailDispatcher.ts`)

- **Respeito aos Modos de Execução:**
  - Em modo de revisão (`SEMI_AUTO` ou abaixo do limiar automático), apresenta destinatário, assunto, corpo do e-mail e caminho do anexo para aprovação antes do envio.
  - Em modo automático (`FULL_AUTO` acima da régua de aderência), dispara o e-mail após passar pelas checagens de segurança.
- **Credenciais Blindadas e Resiliência:** Obtém senhas de app, chaves SMTP ou tokens de provedor de e-mail diretamente do cofre criptografado (AES-256-GCM), com fila local e nova tentativa automática em caso de falha temporária de rede — no máximo **3 tentativas com backoff**; esgotadas, a candidatura vai para `NEEDS_HUMAN_INPUT`.
- **Escopo de respostas:** respostas do recrutador no mesmo thread ficam fora de escopo — o módulo envia e monitora, nunca responde e-mails.

### 3.4. Rastreador de Envio e Retorno (`emailTracker.ts`)

- Registra no banco local o destinatário, o assunto, o arquivo de currículo enviado, o timestamp e o status (`APPLIED_VIA_EMAIL`), permitindo acompanhar respostas e retornos na mesma linha do tempo das candidaturas web.

## 4. Estrutura de Diretórios do Módulo

```text
src/email_application/
├── emailAppCore.ts          # Orquestrador central do fluxo de candidatura por e-mail
├── recipientResolver.ts     # Extração, validação e deduplicação de e-mails de destino
├── emailComposer.ts         # Geração de assunto/corpo com LLM + cache e vínculo de anexo
├── emailDispatcher.ts       # Envio via SMTP/API, controle de fila e integração com o cofre
├── emailTracker.ts          # Persistência de logs, status e histórico no banco local
└── emailAppConfig.ts        # Regras de aprovação, idioma, anexos e limites de envio
```

## 5. Parâmetros de Configuração (`emailAppConfig.ts`)

O comportamento do envio de currículos por e-mail é definido de forma declarativa:

| Parâmetro | Descrição |
|-----------|-----------|
| `enabled` | Liga ou desliga o fallback de candidatura por e-mail quando não houver formulário web. |
| `dispatchMode` | Define se o envio exige revisão prévia (`REQUIRE_REVIEW`), opera de forma híbrida por Fit Score (`HYBRID_BY_SCORE`) ou envia automaticamente (`AUTO_SEND_HIGH_FIT`). |
| `minScoreAutoSend` | Score mínimo de aderência exigido para disparar o e-mail sem revisão manual prévia. |
| `attachTailoredResume` | Garante que o currículo PDF/DOCX adaptado à vaga seja anexado automaticamente (com fallback para o currículo base caso não haja geração específica). |
| `maxDailyEmails` | Teto diário de candidaturas por e-mail para proteger a reputação da conta remetente. |
| `smtpCredentialRef` | Aponta para o segredo protegido no cofre criptografado do sistema, sem expor dados sensíveis em configuração. |

## 6. Fluxo de Integração com o CareerFacilator AI

1. **Detecção Sem Formulário:** O módulo de formulário identifica que a vaga não possui campos interativos de envio, mas contém um e-mail de contato/recrutamento.
2. **Montagem do Pacote:** O `emailAppCore.ts` valida o destinatário, recupera o currículo adaptado da vaga e monta o assunto e o corpo alinhados à skill ativa.
3. **Aprovação ou Disparo:** Se exigir revisão, exibe uma prévia clara com destinatário, assunto, resumo do texto e anexo; após o envio, grava `APPLIED_VIA_EMAIL` no banco local para impedir candidaturas duplicadas.

---

« [Anterior: Confiabilidade](10-confiabilidade.md) | [Índice](README.md) | [Próximo: Roadmap →](12-roadmap.md)
