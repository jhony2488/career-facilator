# 14. Configurar SMTP — Gmail e Outlook

Guia prático para configurar o envio de candidaturas por e-mail (`src/email_application/`, doc 11). As credenciais ficam **sempre no cofre criptografado** (`CAREER_VAULT_SECRET`) — nunca em `.env` ou config em texto claro.

## 14.1 Como funciona

1. Você gera uma **senha de app** no provedor (não a senha da conta).
2. `career vault set smtp-main` grava `{host, port, secure, user, pass}` cifrado com AES-256-GCM em `<home>/vault/smtp-main.cred`.
3. No `run`, o transporte SMTP busca a credencial no cofre **a cada envio** — nada de senha em log ou processo de terceiros.

```powershell
# Chave do cofre (qualquer string forte; guarde-a — sem ela nada descriptografa)
career config set CAREER_VAULT_SECRET <sua-frase-secreta-forte>

# Grava a credencial SMTP (prompts interativos no shell)
career
career> vault set smtp-main
#  SMTP host: smtp.gmail.com
#  SMTP port: 465
#  TLS direto? s
#  Usuário: voce@gmail.com
#  Senha de app: <app-password-de-16-caracteres>
```

## 14.2 Gmail

1. Ative a **verificação em 2 etapas** na conta Google (obrigatório para app passwords).
2. Gere um **App Password** em `myaccount.google.com/apppasswords` — nome tipo "CareerFacilator".
3. Use em `vault set smtp-main`:
   - host `smtp.gmail.com` · port `465` · TLS direto **sim** (ou `587` + TLS direto **não** → STARTTLS)
   - usuário = seu e-mail · senha = o app password de 16 caracteres

Limite Google: ~500 e-mails/dia (conta gratuita). O teto padrão do sistema é **45/dia** — confortavelmente abaixo.

## 14.3 Outlook / Microsoft 365

1. Em contas pessoais, gere um **app password** (requer 2FA ativo). Em Microsoft 365 corporativo, o admin pode precisar habilitar **SMTP AUTH** na mailbox.
2. Use em `vault set smtp-main`:
   - host `smtp.office365.com` · port `587` · TLS direto **não** (STARTTLS)
   - usuário = e-mail completo · senha = app password

## 14.4 Ajustes finos

| Env | Default | Efeito |
|-----|---------|--------|
| `EMAIL_MAX_DAILY` | `45` | Teto de e-mails/dia (vagas acima → `DEFERRED` p/ amanhã) |
| `EMAIL_DISPATCH_MODE` | `HYBRID_BY_SCORE` | `REQUIRE_REVIEW` = sempre revisar · `HYBRID_BY_SCORE` = revisar abaixo do score · `AUTO_SEND_HIGH_FIT` = enviar direto |
| `EMAIL_MIN_SCORE_AUTO_SEND` | `88` | Régua do modo híbrido |
| `EMAIL_TEMPLATE_PATH` | `<home>/storage/email_template.md` | Seu modelo de corpo — placeholders `{{jobTitle}} {{company}} {{linkedin}} {{github}} {{salaryExpectation}}` etc. |
| `EMAIL_INCLUDE_SALARY` | `true` | Linha de pretensão salarial conforme `marketScope` + locale |
| `EMAIL_COOLDOWN_DAYS` | `30` | Anti-duplicidade por destinatário |
| `EMAIL_RETRY_MAX` / `EMAIL_RETRY_BACKOFF_MS` | `3` / `60000` | Falha transitória → retry; esgotado → `NEEDS_HUMAN_INPUT` |
| `EMAIL_SMTP_CREDENTIAL_REF` | `smtp-main` | Ref do segredo no cofre |
| `EMAIL_ENABLED` | `true` | `false` desliga o canal inteiro |

Exemplo: `career config set EMAIL_MAX_DAILY 30`.

## 14.5 Testar sem enviar

- `review` — mostra `READY_TO_REVIEW` (modo revisão) e `NEEDS_HUMAN_INPUT` (vagas sem canal); no shell interativo marca cada item — `mark <url|id> <status>` e `remove <url|id>` funcionam como comandos diretos
- `run --dry-run` — simula o pipeline inteiro sem tocar em SMTP

---

« [Anterior: Ingestão de Perfil](13-ingestao-de-perfil.md) | [Índice](README.md) | [Próximo: Candidatura por WhatsApp →](15-candidatura-por-whatsapp.md)
