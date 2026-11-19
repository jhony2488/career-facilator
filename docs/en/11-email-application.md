# Email Application Module (`src/email_application/`)

**Email Flow Detection, Optimized Composition with LLM/Prompt Caching, Tailored Resume Attachment and Safe Dispatch for CareerFacilator AI**

## 1. Module Overview

Not every opportunity has a web form or a direct ATS portal: many companies, startups and recruiters ask the candidate to send their resume and introduction directly to an e-mail address (e.g.: `vagas@empresa.com`, `rh@...` or `careers@...`).

The `email_application` module kicks in when the form inspection step does not find a direct web application flow and identifies an e-mail submission channel. It leverages the already tailored resume (PDF/DOCX) and the job's active skill to compose a short, objective and contextualized message, respecting human review rules, deduplication and the security of credentials stored in the vault.

## 2. Email Resume Submission Architecture

```text
[ Approved Job (No Direct Web Form / Contact E-mail Detected) ]
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  EMAIL APPLICATION ORCHESTRATOR                         │
│  • Recipient & Domain Validation • E-mail/Job Deduplication             │
│  • SMTP/API Credential Retrieval via Vault (AES-256-GCM)                │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│          SUBJECT & BODY GENERATOR (LLM + PROMPT CACHING)                │
│  • Uses Profile + Active Skill + Job Summary (Token Savings)            │
│  • Produces Direct Subject + Short Body + Attachment (Tailored CV)      │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│        AUTONOMY GATE (SEMI_AUTO vs. FULL_AUTO) & DISPATCH               │
│  • Pause on HUD/CLI for Review (if required) • Send via SMTP/API        │
│  • Record in SQLite (status: APPLIED_VIA_EMAIL) & Queue/Retry           │
└─────────────────────────────────────────────────────────────────────────┘
```

## 3. Components and Submodules

### 3.1. Recipient Detector and Validator (`recipientResolver.ts`)

- **Target E-mail Extraction:** Locates recruitment or contact addresses in the job text, careers page or opportunity metadata, prioritizing inboxes tied to jobs/talent over unrelated generic e-mails when multiple options exist.
- **Sanitization and Anti-Duplication:** Checks the local database for any previous submission to that same address/job within the cooldown period, avoiding repeated dispatches to the same inbox.

### 3.2. Message Composer and Attachment (`emailComposer.ts`)

- **Economical Context Injection:** Reuses the job summary, Fit Score and already-selected skill (e.g.: `fullstack-ts`, `ai-engineer` or `international-remote`), avoiding reprocessing the entire raw history.
- **Tailored Subject and Body:** Generates a clear subject (e.g.: referencing the role and area), a short text with the points most aligned with the requirements and automatically attaches the tailored resume file generated for that application.
- **Language Adaptation:** Writes the e-mail in PT-BR for the national scope or EN-US for the international scope, keeping consistency with the attached resume.

### 3.3. Autonomy Controller and Dispatch (`emailDispatcher.ts`)

- **Respect for Execution Modes:**
  - In review mode (`SEMI_AUTO` or below the automatic threshold), presents the recipient, subject, e-mail body and attachment path for approval before sending.
  - In automatic mode (`FULL_AUTO` above the match scale), dispatches the e-mail after passing the safety checks.
- **Hardened Credentials and Resilience:** Obtains app passwords, SMTP keys or e-mail provider tokens directly from the encrypted vault (AES-256-GCM), with a local queue and automatic retry in case of temporary network failure.

### 3.4. Submission and Response Tracker (`emailTracker.ts`)

- Records in the local database the recipient, subject, resume file sent, timestamp and status (`APPLIED_VIA_EMAIL`), allowing you to track answers and responses on the same timeline as web applications.

## 4. Module Directory Structure

```text
src/email_application/
├── emailAppCore.ts          # Central orchestrator of the email application flow
├── recipientResolver.ts     # Extraction, validation and deduplication of destination e-mails
├── emailComposer.ts         # Subject/body generation with LLM + cache and attachment binding
├── emailDispatcher.ts       # Sending via SMTP/API, queue control and vault integration
├── emailTracker.ts          # Persistence of logs, status and history in the local database
└── emailAppConfig.ts        # Approval rules, language, attachments and sending limits
```

## 5. Configuration Parameters (`emailAppConfig.ts`)

The behavior of resume submission by e-mail is defined declaratively:

| Parameter | Description |
|-----------|-------------|
| `enabled` | Turns the e-mail application fallback on or off when there is no web form. |
| `dispatchMode` | Defines whether sending requires prior review (`REQUIRE_REVIEW`), operates in a hybrid Fit Score-based mode (`HYBRID_BY_SCORE`) or sends automatically (`AUTO_SEND_HIGH_FIT`). |
| `minScoreAutoSend` | Minimum match score required to dispatch the e-mail without prior manual review. |
| `attachTailoredResume` | Ensures the tailored PDF/DOCX resume is automatically attached (with fallback to the base resume if no specific version was generated). |
| `maxDailyEmails` | Daily cap on e-mail applications to protect the sender account's reputation. |
| `smtpCredentialRef` | Points to the protected secret in the system's encrypted vault, without exposing sensitive data in configuration. |

## 6. Integration Flow with CareerFacilator AI

1. **Formless Detection:** The form module identifies that the job has no interactive submission fields but contains a contact/recruitment e-mail.
2. **Package Assembly:** `emailAppCore.ts` validates the recipient, retrieves the job's tailored resume and composes the subject and body aligned with the active skill.
3. **Approval or Dispatch:** If review is required, it displays a clear preview with recipient, subject, text summary and attachment; after sending, it records `APPLIED_VIA_EMAIL` in the local database to prevent duplicate applications.

---

« [Previous: Reliability](10-reliability.md) | [Index](README.md) | [Next: Roadmap →](12-roadmap.md)
