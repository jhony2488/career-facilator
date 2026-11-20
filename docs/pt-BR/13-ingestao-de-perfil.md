# 13. Ingestão de Perfil (PDF → Perfil-Mestre)

Módulo responsável por transformar os documentos do usuário (currículos em PDF) no **perfil-mestre**, fonte única de verdade para triagem e geração de ativos. O perfil-mestre é um arquivo Markdown editável em qualquer editor de texto — o usuário pode revisar, corrigir e complementar manualmente.

## 13.1. Regra anti-fabricação (invariante)

O sistema **nunca** cria dados profissionais. Nada entra no perfil-mestre sem uma destas duas origens:

1. Conteúdo literalmente presente em um documento fornecido pelo usuário;
2. Edição manual feita pelo próprio usuário no arquivo mestre.

Campos não encontrados no documento permanecem vazios (`NÃO_INFORMADO`) — nunca são inferidos por contexto ou senso comum da LLM. Esta regra é a base do contrato já exigido na geração de currículos (ver `05-geracao-curriculo.feature`): o tailoring só pode reorganizar e enfatizar o que existe no perfil aprovado.

## 13.2. Pipeline de ingestão

O fluxo é orquestrado por `intakeCore.ts`, que dispara a sequência abaixo tanto para PDFs detectados na pasta monitorada quanto para o comando de importação:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    0. PROFILE INTAKE (src/intake/)                      │
│                                                                         │
│  [ Entrada ]                                                            │
│    • Pasta monitorada: storage/profile_inbox/ (arrastar PDFs)           │
│    • Comando explícito: career-facilitator import --pdf <caminho>       │
│                          │                                              │
│                          ▼                                              │
│  pdfExtractor.ts      Extrai a camada de texto do PDF.                  │
│                       PDF digitalizado/sem texto → sinaliza ao usuário  │
│                       (nenhum OCR silencioso que possa inventar dados)  │
│                          │                                              │
│                          ▼                                              │
│  profileStructurer.ts LLM leve + Zod (MasterProfileSchema).             │
│                       Extrai SOMENTE o que consta no documento;         │
│                       trechos de baixa confiança entram marcados.       │
│                          │                                              │
│                          ▼                                              │
│  masterProfileStore.ts Grava storage/profile.draft.md (rascunho).       │
│                       Merge ou replace escolhidos no ato da importação: │
│                       • Merge: soma dados novos; conflitos sinalizados  │
│                       • Replace: versão anterior vai para o histórico  │
│                          │                                              │
│                   [ Aprovação humana obrigatória ]                      │
│                          │                                              │
│                          ▼                                              │
│  profileCompiler.ts   Valida o MD e compila src/config/profile.master.  │
│                       json (artefato tipado do bloco de cache de        │
│                       prompt). Invalida o cache e sinaliza Fit Scores   │
│                       para recálculo.                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Pasta monitorada na prática:** `career-facilitator import --inbox` varre `profile_inbox/` e importa cada PDF como fonte `INBOX`; `--watch` mantém a varredura contínua (solte um PDF na pasta e ele é processado sozinho). Todo arquivo varrido — legível ou não — é arquivado em `profile_inbox/processed/`, garantindo que nenhum documento seja reprocessado nem alertado duas vezes.

## 13.3. Fluxo de revisão humana

Alinhado ao princípio global de Human-in-the-Loop, **nenhum conteúdo extraído entra em vigor automaticamente**:

1. O PDF processado gera/atualiza `storage/profile.draft.md` — trechos extraídos com baixa confiança entram **marcados para revisão**;
2. O usuário revisa o rascunho (diff legível contra a versão ativa);
3. Ao aprovar, o rascunho é promovido a `src/config/profile.master.md` e compilado — a versão anterior vira um **snapshot** no histórico (um por aprovação);
4. Enquanto houver rascunho pendente, o sistema continua usando a última versão aprovada.

O usuário também pode editar `profile.master.md` diretamente — a próxima execução recompila e adota as alterações.

## 13.4. Formato do perfil-mestre (Markdown)

`profile.master.md` usa seções fixas e previsíveis, validadas pelo `profileCompiler.ts`:

- **Dados pessoais** — nome, contatos, links (LinkedIn, GitHub, portfólio)
- **Resumo** — título profissional e pitch curto
- **Experiências** — cargo, empresa, período, responsabilidades e métricas
- **Projetos** — nome, stack, resultado mensurável
- **Projetos Open Source** — nome, repositório, contribuição, resultado mensurável
- **Habilidades** — stacks, idiomas, certificações
- **Formação** — curso, instituição, período
- **Respostas padrão** — blocos reutilizáveis para perguntas dissertativas comuns

O compilador rejeita/compila parcialmente seções fora do padrão, sinalizando ao usuário o que precisa de ajuste — nunca "corrigindo" inventando conteúdo.

## 13.5. Configuração

```typescript
profile: {
  inboxDir: 'storage/profile_inbox/',        // Pasta monitorada para novos PDFs
  draftPath: 'storage/profile.draft.md',     // Rascunho aguardando aprovação
  masterPath: 'src/config/profile.master.md',// Fonte editável (ativa)
  compiledPath: 'src/config/profile.master.json', // Artefato do cache de prompt
  historyDir: 'storage/profile_history/',    // Versões anteriores (replace/rollback)
}
```

## 13.6. Efeitos downstream

- **Triagem:** `triageAgent.ts` continua cruzando a vaga contra o perfil compilado; atualização do perfil recalcula os Fit Scores das vagas em `TRIAGED`/`TAILORED`.
- **Candidaturas pendentes:** materiais de vagas em `TAILORED`/`READY_TO_REVIEW` são **regenerados** com o perfil novo.
- **Tailoring:** `tailorerAgent.ts` recebe o JSON compilado no bloco de cache (ver `03-otimizacao-de-ia.md`, §5.3) — permanece proibido de incluir qualquer habilidade ausente do perfil.
- **Autofill:** `deterministicMatcher.ts` resolve campos padrão a partir do perfil compilado.

---

« [Anterior: Roadmap](12-roadmap.md) | [Índice](README.md) | [Próximo: Configurar SMTP →](14-configurar-smtp-gmail-outlook.md)
