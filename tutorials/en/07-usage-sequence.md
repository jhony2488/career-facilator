# Tutorial 07 — Suggested usage sequence

Recommended end-to-end journey through CareerFacilator — from install to daily routine. Each step shows the command, what to check, and where to look when something fails.

## Big picture

```text
install → configure AI → feed the profile → verify discovery
        → first run (dry-run → real) → review/status → channels → routine
```

## Step 0 — Install

Pick one mode (all of them use the same `career` CLI):

- Repository → [tutorial 01](01-local-repo-install.md)
- Global npm → [tutorial 02](02-npm-global-install.md)
- Release binary → [tutorial 03](03-release-binary-install.md)

Sanity check: `career` opens the shell and `help` lists commands by section.

## Step 1 — Configure the AI

- Local (zero cost) → [tutorial 04 — Ollama](04-setting-up-ollama.md)
- Cloud → [tutorial 05 — remote providers](05-setting-up-remote-llms.md)

Verify with:

```powershell
career config check   # tests endpoint+model for the 3 tiers
```

The **LOCAL** tier must pass — it runs triage. Optional: embeddings for semantic matching (`AI_EMBEDDINGS_ENABLED=true` + `ollama pull nomic-embed-text`).

## Step 2 — Feed the profile

```powershell
career import --pdf cv.pdf   # structures → profile.draft.md
```

1. Review `storage/profile.draft.md` — nothing enters the profile unless it comes from your documents or a manual edit (anti-fabrication rule).
2. Approve: `career approve` → becomes `profile.master.md` + compiled JSON.

Without a configured model, `import` only produces a minimal draft — in that case, fill `profile.master.md` directly.

## Step 3 — Verify discovery (zero AI cost)

```powershell
career discover --dry-run           # active sources after DISCOVERY_* filters
career scan remoteok --max-jobs 2   # sample jobs from one source
career discover --max-jobs 10       # lists real jobs
```

If few or no jobs appear, tune `JOB_TITLES` and the `DISCOVERY_*` filters — details in [tutorial 06](06-discovering-jobs.md). `html` sources without API/RSS use the LLM fallback (inherits the LOCAL tier).

## Step 4 — First funnel run

```powershell
career run --dry-run   # full funnel without sending anything
career run             # real run (respects EXECUTION_MODE)
```

Then work the queue — in the shell (`career` with no arguments) `review` asks each item's outcome:

```powershell
career review                 # READY_TO_REVIEW, NEEDS_HUMAN_INPUT and the WhatsApp queue
                              # (in the shell: e=sent on web · m=email · w=whatsapp · p=skip · f=failed · x=delete)
career mark <url> applied     # a manual application becomes APPLIED (email|whatsapp|skipped|failed|…)
career remove <url>           # drops the job from history — re-eligible on the next run
career retry [url|id]         # re-runs only the web stage of NEEDS_HUMAN_INPUT jobs
                              # (same vault-login/OTP mesh as run — no discovery/triage)
career status                 # status counts in the database
```

Under `HYBRID_THRESHOLD`, jobs ≥ 88% go by themselves, ≥ 75% get tailored material and wait in `review`.

## Step 5 — Enable channels (optional)

- **Email:** `career vault set smtp-main` (Gmail/Outlook app password) + `EMAIL_ENABLED=true` in `.env` — 45/day cap. Full guide in `docs/pt-BR/14-configurar-smtp-gmail-outlook.md`.
- **WhatsApp:** `WHATSAPP_ENABLED=true` + `career whatsapp setup` (QR in the terminal). Default `MANUAL_QUEUE` — number+message+PDF wait in `review` for manual send; confirm with `w` in the interactive review or `career mark <url> whatsapp` to activate the per-number cooldown. Doc 15.
- **Login-required portals (Gupy, LinkedIn…):** `AUTOFILL_PROFILE_DIR=./browser-profile` in `.env` + `career login <url|portal>` — the browser opens for manual sign-in and the session is reused on runs. CAPTCHA/login walls during a run reopen the form visibly for on-the-spot resolution. **Gupy heads-up:** sign-in is per subdomain (`<company>.gupy.io`) — one manual login per company is not enough. Store the credential with `career vault set login-gupy` and login walls authenticate on their own. E-mail verification codes (OTP/magic-link) are read from your mailbox via `career vault set imap-main` — Gmail/Outlook derive the IMAP host from the `smtp-main` credential itself. Doc 10.

## Step 6 — Daily routine

```powershell
career import --inbox --watch   # optional: drop new PDFs in the inbox
career run                      # discovery + funnel cycle
career review                   # handle what is left for humans
career status                   # metrics
```

Iterate discovery filters (`JOB_TITLES`, `DISCOVERY_*`) based on the jobs that show up — tuning is the main day-to-day adjustment.

Next: [README](README.md) · [Discovering jobs](06-discovering-jobs.md)
