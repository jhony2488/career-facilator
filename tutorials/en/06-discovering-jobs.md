# Tutorial 06 — Discovering jobs (discovery)

`run` performs job discovery whenever you do **not** pass `--jobs-file`. This tutorial covers the `discover` and `scan` commands, the source registry, and the generic LLM fallback.

## 1. List the active sources

```powershell
career discover --dry-run
```

Typical output — the public sources enabled by default:

```text
Fontes ativas (7):
  remoteok                 RemoteOK (api)
  remotive                 Remotive (api)
  jobicy                   Jobicy (api)
  arbeitnow                Arbeitnow (api)
  workingnomads            Working Nomads (api)
  himalayas                Himalayas (api)
  weworkremotely           We Work Remotely (rss)
```

The full registry has 145 sources (BR/LATAM/EU/US boards, ATS, niche, freelance). Sources flagged "risky" or requiring a session stay out until you opt in.

## 2. Discover jobs

```powershell
career discover                          # default active sources, up to 10 jobs
career discover --max-jobs 30            # up to 30 jobs total
career discover --sources remoteok,remotive
career discover --export jobs.json       # writes the format `run --jobs-file` accepts
```

## 3. Test a single source

```powershell
career scan remoteok --max-jobs 2
```

Prints the URL and a job snippet — useful to check whether the source responds and whether titles match `JOB_TITLES`.

## 4. Discovery inside the funnel

```powershell
career run                  # discovers jobs and runs the full pipeline (triage, tailoring, application)
career run --dry-run        # same, without sending anything
career run --sources remoteok --max-jobs 20
career run --jobs-file jobs.json   # skips discovery and uses a [{url, html}] file
```

## 5. `DISCOVERY_*` variables

| Env                              | What it does                                                                 | Default         |
| -------------------------------- | ---------------------------------------------------------------------------- | --------------- |
| `DISCOVERY_SOURCES`              | ID allowlist (empty = enabled sources)                                       | —               |
| `DISCOVERY_EXCLUDE_SOURCES`      | Removes IDs from the run                                                     | —               |
| `DISCOVERY_REGIONS`              | Filters sources by `BR,LATAM,PT,EU,US,GLOBAL,ASIA,OCEANIA`                   | —               |
| `DISCOVERY_WORK_MODELS`          | `REMOTE,HYBRID,ONSITE` — remote-only sources drop out if you remove `REMOTE` | `REMOTE,HYBRID` |
| `DISCOVERY_MAX_JOBS_PER_SOURCE`  | Per-source cap                                                               | `20`            |
| `DISCOVERY_MAX_JOBS_PER_RUN`     | Global cap per run                                                           | `100`           |
| `DISCOVERY_CONCURRENCY`          | Sources in parallel                                                          | `4`             |
| `DISCOVERY_PER_DOMAIN_DELAY_MS`  | Minimum per-domain delay                                                     | `1500`          |
| `DISCOVERY_USE_GENERIC_FALLBACK` | LLM extractor for `html` sources without API/RSS                             | `true`          |
| `DISCOVERY_GENERIC_MODEL`        | Extractor model — **empty inherits `AI_LOCAL_*`**                            | empty           |

## 6. Generic fallback (HTML + LLM)

`html` sources without API/RSS go through assisted extraction: the page becomes Markdown and a model extracts `{title, url, company, location, description}`. Rules:

- Enable an `html` source via allowlist: `career discover --sources justremote` (risky sources need opt-in).
- **Model:** a non-empty `DISCOVERY_GENERIC_MODEL` uses that ID; empty inherits `AI_LOCAL_PROVIDER`/`AI_LOCAL_MODEL`. Only the `ollama` provider today.
- The log shows the resolved model: `Fallback genérico (HTML+LLM): ollama/llama3.2:3b — herdado de AI_LOCAL_*`.
- The prompt requires real URLs and empty fields for missing data — the anti-fabrication rule applies here too.
- A source without a listing URL, without the fallback, or with an AI failure → error is recorded and the cycle continues with the other sources.

## 7. Organic search (dorks)

`search` sources query the configured engine — `DISCOVERY_SEARCH_ENGINE=duckduckgo|bing` (the other becomes a per-query fallback when the primary fails/gets blocked). Current IDs:

- `searchdork` — scope-driven query plan (`dorkBuilder`): `site:` ATS dorks (Greenhouse/Lever/Ashby) + aggregator searches.
- `linkedin-posts` — `site:linkedin.com/posts` + job terms — **no session, never touches your account**. Posts don't carry job titles, so the source runs with `titleFilter` off.
- `linkedin-jobs` — `site:linkedin.com/jobs/view` — indexed public listings.

```powershell
career scan linkedin-posts --max-jobs 5
career discover --sources searchdork
```

Honest notes: `site:` is sometimes relaxed by the engine — the adapter filters hits by the real domain, so 0 results is possible when nothing is indexed. SERP markup also changes; failures become `DiscoveryError`s and the cycle continues.

## 8. Tips

- `JOB_TITLES` controls the title filter across **all** sources — tune it before raising `--max-jobs`.
- `career run` aborts with an alert and zero AI calls if **every** source fails.
- Discovered jobs go through the 3-level deduplication (canonical URL, content hash, company cooldown) before any AI call.

Next: [README](README.md) · [Setting up remote LLMs](05-setting-up-remote-llms.md)
