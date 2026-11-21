# 15. WhatsApp Application

Module `src/whatsapp_application/`: when a job asks to apply via a **WhatsApp number** and neither a web form nor e-mail is reachable, the system offers two modes — **manual queue** (default) or **send via Evolution API**. Channel order in the pipeline: **web form → e-mail → WhatsApp → `NEEDS_HUMAN_INPUT`**.

## 15.1 Module structure

```text
src/whatsapp_application/
├── whatsappResolver.ts   # Extracts the number: wa.me/<num>, api.whatsapp.com/send?phone=, WhatsApp-context line + phone
├── whatsappComposer.ts   # Text via template (whatsapp_template.md → fallback: same e-mail model) + resolves the PDF
├── evolutionClient.ts    # Self-hosted REST: POST /message/sendText and /message/sendMedia (base64 PDF)
└── whatsappAppCore.ts    # Orchestrator: resolve → compose → manual queue or send → record
```

## 15.2 `MANUAL_QUEUE` mode (default)

With no extra configuration, the pipeline:

1. Detects the number in the job description;
2. Generates the **ready message** (same model as e-mail: greeting, links, salary expectation) and resolves the **PDF** (tailored resume → fallback `storage/master_resume.pdf`);
3. Records the queue entry and marks the job `NEEDS_HUMAN_INPUT` with reason `WHATSAPP_MANUAL`.

`career review` lists items with `wa.me/<number>`, the ready-to-copy message and the PDF path to attach:

```text
2 WhatsApp application(s) to send by hand:
  [Senior Dev — TechCorp] wa.me/5581999887766
    Message:
      Bom dia,

      Segue em anexo o meu currículo e mais alguns links importantes.
      ...
    Attach: storage/generated_resumes/job-042.pdf
```

After sending the message by hand, **confirm the send** to close the loop — in the interactive shell (`career` with no arguments) `review` asks item by item (`w` = sent via WhatsApp), or directly: `career mark <url|id> whatsapp`. The confirmation flips the queue row to `APPLIED_VIA_WHATSAPP` with `sent_at` — activating the per-number cooldown — and updates the job status. Without confirmation, the item stays pending until it expires (`reviewExpirationDays`).

## 15.3 `EVOLUTION_API` mode

**Evolution API** is a self-hosted REST gateway for WhatsApp. Requirement: you run the server yourself (e.g. Docker `atendai/evolution-api`) and link the number via QR code — the CLI handles that pairing for you.

**Setup from the CLI itself** (instance + QR in the terminal):

```powershell
career config set EVOLUTION_API_URL http://localhost:8080
career config set EVOLUTION_API_KEY <server-apikey>
career whatsapp setup [name]   # default: 'default'
# → creates the instance and shows the QR CODE in the terminal
# → scan it in WhatsApp (Linked devices) and wait for "✓ Connected!"
# → the name is saved to EVOLUTION_INSTANCE automatically

career whatsapp status         # connection state of the configured instance
career config set WHATSAPP_MODE EVOLUTION_API   # enables automatic sending
```

During `run`, the system sends **`sendText`** (rendered message) and **`sendMedia`** (base64 PDF, `mediatype=document`) to `POST {EVOLUTION_API_URL}/message/.../{instance}` with an `apikey` header. Success → `APPLIED_VIA_WHATSAPP` recorded. Transient failure (HTTP 429/5xx, timeout) → up to 3 retries with backoff → `NEEDS_HUMAN_INPUT`.

## 15.4 Configuration (`whatsapp:` in `careerOps.config.ts`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `enabled` | `true` | Channel on/off (`WHATSAPP_ENABLED`) |
| `mode` | `MANUAL_QUEUE` | `MANUAL_QUEUE` or `EVOLUTION_API` (`WHATSAPP_MODE`) |
| `apiInstance` | `default` | Evolution API instance (`EVOLUTION_INSTANCE`) |
| `apiUrlEnv` / `apiKeyEnv` | `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` | Env names — secrets never live in config |
| `bodyTemplatePath` | `<home>/storage/whatsapp_template.md` | Custom template; absent → e-mail model (`WHATSAPP_TEMPLATE_PATH`) |
| `recipientCooldownDays` | `30` | Per-number anti-duplicate window (`WHATSAPP_COOLDOWN_DAYS`) |
| `attachResume` | `true` | Attaches the PDF to the message (`WHATSAPP_ATTACH_RESUME`) |
| `maxRetries` / `retryBackoffMs` | `3` / `60000` | Transient retry → `NEEDS_HUMAN_INPUT` |

## 15.5 Anti-duplicate & security

- Per-number cooldown (default 30d): a contacted number never gets a repeat message — mirrors the e-mail rule.
- Every application becomes an `applications` row (`channel='WHATSAPP'`): number, message and PDF are auditable.
- The message never invents data: placeholders without a profile value drop out of the line (`renderTemplate` rule).
- `MANUAL_QUEUE` is the default because keeping a human on the trigger is a requirement, not an option — automated mode requires explicit configuration.

## 15.6 State

`APPLIED_VIA_WHATSAPP` joins the state machine as a final sent state, alongside `APPLIED` (web) and `APPLIED_VIA_EMAIL`.

---

« [Previous: SMTP Setup](14-smtp-gmail-outlook-setup.md) | [Index](README.md)
