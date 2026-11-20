# 15. Candidatura por WhatsApp

Módulo `src/whatsapp_application/`: quando a vaga pede candidatura por **número de WhatsApp** e não há formulário web nem e-mail alcançável, o sistema oferece dois modos — **fila manual** (default) ou **envio via Evolution API**. A ordem de canal no pipeline é: **formulário web → e-mail → WhatsApp → `NEEDS_HUMAN_INPUT`**.

## 15.1 Estrutura do módulo

```text
src/whatsapp_application/
├── whatsappResolver.ts   # Extrai número: wa.me/<num>, api.whatsapp.com/send?phone=, linha com contexto de WhatsApp + telefone
├── whatsappComposer.ts   # Texto via template (whatsapp_template.md → fallback: mesmo modelo do e-mail) + resolve o PDF
├── evolutionClient.ts    # REST self-hosted: POST /message/sendText e /message/sendMedia (PDF base64)
└── whatsappAppCore.ts    # Orquestrador: resolve → compõe → fila manual ou envio → registra
```

## 15.2 Modo `MANUAL_QUEUE` (default)

Sem nenhuma configuração extra, o pipeline:

1. Detecta o número na descrição da vaga;
2. Gera a **mensagem pronta** (mesmo modelo de e-mail: saudação, links, pretensão salarial) e resolve o **PDF** (currículo adaptado → fallback `storage/master_resume.pdf`);
3. Registra na fila e marca a vaga `NEEDS_HUMAN_INPUT` com razão `WHATSAPP_MANUAL`.

`career review` lista os itens com `wa.me/<número>`, a mensagem pronta para copiar e o caminho do PDF a anexar:

```text
2 candidatura(s) por WhatsApp para enviar na mão:
  [Senior Dev — TechCorp] wa.me/5581999887766
    Mensagem:
      Bom dia,

      Segue em anexo o meu currículo e mais alguns links importantes.
      ...
    Anexar: storage/generated_resumes/job-042.pdf
```

## 15.3 Modo `EVOLUTION_API`

A **Evolution API** é um gateway REST self-hosted para WhatsApp. Requisito: você mesmo sobe o servidor (ex.: Docker `atendai/evolution-api`) e conecta o número via QR code — a CLI faz esse pareamento por você.

**Setup pela própria CLI** (instância + QR no terminal):

```powershell
career config set EVOLUTION_API_URL http://localhost:8080
career config set EVOLUTION_API_KEY <apikey-do-servidor>
career whatsapp setup [nome]   # default: 'default'
# → cria a instância e exibe o QR CODE no terminal
# → escaneie no WhatsApp (Aparelhos conectados) e aguarde "✓ Conectado!"
# → o nome é salvo em EVOLUTION_INSTANCE automaticamente

career whatsapp status         # estado da conexão da instância configurada
career config set WHATSAPP_MODE EVOLUTION_API   # liga o envio automático
```

No `run`, o sistema envia **`sendText`** (mensagem renderizada) e **`sendMedia`** (o PDF em base64, `mediatype=document`) para `POST {EVOLUTION_API_URL}/message/.../{instance}` com header `apikey`. Sucesso → `APPLIED_VIA_WHATSAPP` registrado no banco. Falha transitória (HTTP 429/5xx, timeout) → até 3 tentativas com backoff → `NEEDS_HUMAN_INPUT`.

## 15.4 Configuração (`whatsapp:` no `careerOps.config.ts`)

| Parâmetro | Default | Descrição |
|-----------|---------|-----------|
| `enabled` | `true` | Liga/desliga o canal (`WHATSAPP_ENABLED`) |
| `mode` | `MANUAL_QUEUE` | `MANUAL_QUEUE` ou `EVOLUTION_API` (`WHATSAPP_MODE`) |
| `apiInstance` | `default` | Instância da Evolution API (`EVOLUTION_INSTANCE`) |
| `apiUrlEnv` / `apiKeyEnv` | `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` | Nomes das envs — segredos nunca ficam na config |
| `bodyTemplatePath` | `<home>/storage/whatsapp_template.md` | Template próprio; ausente → modelo do e-mail (`WHATSAPP_TEMPLATE_PATH`) |
| `recipientCooldownDays` | `30` | Anti-duplicidade por número (`WHATSAPP_COOLDOWN_DAYS`) |
| `attachResume` | `true` | Anexa o PDF na mensagem (`WHATSAPP_ATTACH_RESUME`) |
| `maxRetries` / `retryBackoffMs` | `3` / `60000` | Retry transitório → `NEEDS_HUMAN_INPUT` |

## 15.5 Anti-duplicidade e segurança

- Cooldown por número (default 30d): número já contatado não recebe nova mensagem — espelha a regra de e-mail.
- Toda candidatura vira linha em `applications` (`channel='WHATSAPP'`): número, mensagem e PDF ficam auditáveis.
- A mensagem nunca inventa dado: placeholders sem valor no perfil caem fora da linha (regra do `renderTemplate`).
- `MANUAL_QUEUE` é o default porque manter um humano no disparo é requisito, não opção — o modo automático exige decisão explícita de configuração.

## 15.6 Estado

`APPLIED_VIA_WHATSAPP` entra na máquina de estados como destino final de envio, ao lado de `APPLIED` (web) e `APPLIED_VIA_EMAIL`.

---

« [Anterior: Configurar SMTP](14-configurar-smtp-gmail-outlook.md) | [Índice](README.md)
