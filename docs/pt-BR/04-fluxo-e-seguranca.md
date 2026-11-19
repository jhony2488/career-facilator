# 6. Fluxo de Execução e Segurança (Human-in-the-Loop)

Para evitar bloqueios de conta ou envios com informações imprecisas, o pipeline segue uma **máquina de estados rigorosa no SQLite**:

| Status | Descrição |
|--------|-----------|
| `DISCOVERED` | Vaga coletada e deduplicada no banco. |
| `TRIAGED` | Avaliada pela Camada 0 + Camada 1. Se `fitScore < 75`, marcada como `SKIPPED` automaticamente. |
| `TAILORED` | Currículo PDF customizado gerado na pasta `storage/generated_resumes/` e respostas do formulário preparadas. |
| `READY_TO_REVIEW` | O Playwright abre a aba da vaga, preenche todos os campos, anexa o PDF gerado e pausa antes do botão de envio final. |
| `APPLIED` | Após o usuário revisar visualmente no navegador (e resolver eventuais CAPTCHAs) e confirmar no terminal/HUD, o status é atualizado e registrado no histórico. |

---

« [Anterior: Otimização de IA](03-otimizacao-de-ia.md) | [Índice](README.md) | [Próximo: Skills Dinâmicas →](05-skills-dinamicas.md)
