# 14. SMTP Setup — Gmail and Outlook

Practical guide to configure email applications (`src/email_application/`, doc 11). Credentials always live in the **encrypted vault** (`CAREER_VAULT_SECRET`) — never in `.env` or plaintext config.

## 14.1 How it works

1. You generate an **app password** from the provider (not the account password).
2. `career vault set smtp-main` stores `{host, port, secure, user, pass}` encrypted with AES-256-GCM at `<home>/vault/smtp-main.cred`.
3. During `run`, the SMTP transport fetches the credential from the vault **on every send** — no passwords in logs or third-party processes.

```powershell
# Vault key (any strong string; keep it — nothing decrypts without it)
career config set CAREER_VAULT_SECRET <your-strong-secret-phrase>

# Store the SMTP credential (interactive prompts in the shell)
career
career> vault set smtp-main
#  SMTP host: smtp.gmail.com
#  SMTP port: 465
#  Direct TLS? s
#  User: you@gmail.com
#  App password: <16-char-app-password>
```

## 14.2 Gmail

1. Enable **2-Step Verification** on the Google account (required for app passwords).
2. Generate an **App Password** at `myaccount.google.com/apppasswords` — name it e.g. "CareerFacilator".
3. Enter in `vault set smtp-main`:
   - host `smtp.gmail.com` · port `465` · direct TLS **yes** (or `587` + direct TLS **no** → STARTTLS)
   - user = your e-mail · pass = the 16-char app password

Google limit: ~500 e-mails/day (free account). The system default cap is **45/day** — safely below.

## 14.3 Outlook / Microsoft 365

1. Personal accounts: generate an **app password** (requires 2FA). Corporate Microsoft 365 mailboxes may need the admin to enable **SMTP AUTH** on the mailbox.
2. Enter in `vault set smtp-main`:
   - host `smtp.office365.com` · port `587` · direct TLS **no** (STARTTLS)
   - user = full e-mail · pass = app password

## 14.4 Fine-tuning

| Env | Default | Effect |
|-----|---------|--------|
| `EMAIL_MAX_DAILY` | `45` | Daily e-mail cap (extra jobs → `DEFERRED` until tomorrow) |
| `EMAIL_DISPATCH_MODE` | `HYBRID_BY_SCORE` | `REQUIRE_REVIEW` = always review · `HYBRID_BY_SCORE` = review below score · `AUTO_SEND_HIGH_FIT` = send directly |
| `EMAIL_MIN_SCORE_AUTO_SEND` | `88` | Hybrid-mode threshold |
| `EMAIL_TEMPLATE_PATH` | `<home>/storage/email_template.md` | Your body template — placeholders `{{jobTitle}} {{company}} {{linkedin}} {{github}} {{salaryExpectation}}` etc. |
| `EMAIL_INCLUDE_SALARY` | `true` | Salary-expectation line from `marketScope` + locale |
| `EMAIL_COOLDOWN_DAYS` | `30` | Per-recipient anti-duplicate window |
| `EMAIL_RETRY_MAX` / `EMAIL_RETRY_BACKOFF_MS` | `3` / `60000` | Transient failure → retry; exhausted → `NEEDS_HUMAN_INPUT` |
| `EMAIL_SMTP_CREDENTIAL_REF` | `smtp-main` | Vault secret reference |
| `EMAIL_ENABLED` | `true` | `false` disables the channel entirely |

Example: `career config set EMAIL_MAX_DAILY 30`.

## 14.5 Testing without sending

- `review` — shows `READY_TO_REVIEW` (review mode) and `NEEDS_HUMAN_INPUT` (no reachable channel); in the interactive shell it marks each item — `mark <url|id> <status>` and `remove <url|id>` also work as direct commands
- `run --dry-run` — simulates the whole pipeline without touching SMTP

---

« [Previous: Profile Intake](13-profile-intake.md) | [Index](README.md) | [Next: WhatsApp Application →](15-whatsapp-application.md)
