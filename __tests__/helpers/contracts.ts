/**
 * PROVISIONAL CONTRACTS — CareerFacilator AI
 *
 * This file centralizes the domain types and expected signatures of the
 * `src/` modules, derived from docs/pt-BR/ and feature/*.feature.
 *
 * Tests import TYPES from here and FUNCTIONS from `../src/`. While `src/`
 * does not exist, the tests do not compile — intentional behavior (TDD/red-first).
 * When implementation begins, it must satisfy these signatures;
 * divergences must be discussed here before changing the tests.
 *
 * Traceability: each `it()` in the tests references the source .feature
 * scenario via a `// feature/NN: <scenario name>` comment.
 */

// ─── Domain enums / unions ──────────────────────────────────────────────────

export type JobStatus =
  | 'DISCOVERED'
  | 'TRIAGED'
  | 'SKIPPED'
  | 'TAILORED'
  | 'READY_TO_REVIEW'
  | 'APPLIED'
  | 'APPLIED_VIA_EMAIL'
  | 'APPLIED_VIA_WHATSAPP'
  | 'NEEDS_HUMAN_INPUT'
  | 'REJECTED'
  | 'ASSESSMENT_INVITED'
  | 'INTERVIEW'
  | 'DEFERRED'
  | 'DRY_RUN'
  | 'FAILED';

export type ExecutionMode = 'FULL_AUTO' | 'SEMI_AUTO' | 'HYBRID_THRESHOLD';
export type MarketScope = 'NATIONAL' | 'INTERNATIONAL' | 'BOTH';
export type WorkModel = 'REMOTE' | 'HYBRID' | 'ONSITE';
export type ContractType = 'CLT' | 'PJ';
export type IntlRegion = 'WORLDWIDE' | 'LATAM' | 'AMERICAS_TIMEZONE';
export type ModelTier = 'LOCAL' | 'FAST' | 'SMART';
export type EmailDispatchMode = 'REQUIRE_REVIEW' | 'HYBRID_BY_SCORE' | 'AUTO_SEND_HIGH_FIT';
export type WhatsappMode = 'MANUAL_QUEUE' | 'EVOLUTION_API';
export type OutcomeStatus = 'REJECTED' | 'ASSESSMENT_INVITED' | 'INTERVIEW';
export type ApplicationRoute = 'AUTO_SEND' | 'REVIEW' | 'DEFER' | 'ESCALATE';
export type BlockingSignalKind =
  'CAPTCHA' | 'EMAIL_OTP' | 'UNKNOWN_REQUIRED_FIELD' | 'SESSION_EXPIRED';
export type ProfileImportSource = 'INBOX' | 'CLI';
export type ProfileImportMode = 'MERGE' | 'REPLACE';
export type IntakeOutcome = 'DRAFT_PENDING_REVIEW' | 'UNREADABLE_DOCUMENT';

/** Sentinel for fields absent from the document — never inferred (docs/pt-BR/13). */
export const NOT_INFORMED = 'NÃO_INFORMADO';

// ─── Entities ───────────────────────────────────────────────────────────────

export interface JobPosting {
  id: string;
  url: string;
  canonicalUrl: string;
  contentHash: string;
  source: 'ATS_DIRECT' | 'SEARCH_DORK' | 'LINKEDIN' | 'EMAIL';
  company: string;
  title: string;
  descriptionMarkdown: string;
  scope: MarketScope;
  status: JobStatus;
  discoveredAt: string; // ISO 8601
}

export interface ProfileExperience {
  role: string;
  company: string;
  period: string;
  highlights: string[];
}

export interface ProfileEducation {
  course: string;
  institution: string;
  period: string;
}

export interface MasterProfile {
  fullName: string;
  email: string;
  phone: string;
  linkedin: string;
  github: string;
  portfolio: string;
  location: string;
  summary: string;
  coreStack: string[];
  seniorityYears: number;
  experiences: ProfileExperience[];
  projects: Array<{ name: string; summary: string; metrics: string[] }>;
  openSourceProjects: Array<{ name: string; repo: string; summary: string; metrics: string[] }>;
  education: ProfileEducation[];
  languages: string[];
  certifications: string[];
  blockedKeywords: string[];
  standardAnswers: Record<string, string>;
  salaryExpectationBRL: number;
  salaryExpectationUSD: number;
}

/**
 * Result of structuring a document (feature/13).
 * Missing text fields come as NOT_INFORMED; missing numeric fields as null —
 * the system never infers values that are not in the document.
 */
export type ExtractedProfile = Omit<
  MasterProfile,
  'seniorityYears' | 'salaryExpectationBRL' | 'salaryExpectationUSD'
> & {
  seniorityYears: number | null;
  salaryExpectationBRL: number | null;
  salaryExpectationUSD: number | null;
};

export interface PdfExtractionResult {
  text: string;
  hasTextLayer: boolean; // false → scanned/corrupted PDF, flag it without inventing
  pageCount: number;
}

export interface ProfileConflict {
  field: string;
  existing: string;
  incoming: string;
}

export interface CompileResult {
  profile: MasterProfile;
  warnings: string[]; // non-standard sections are flagged, never "fixed" by invention
}

export interface ProfileInvalidation {
  cacheInvalidated: boolean;
  scoresToRecalculate: boolean;
}

/** Injectable filesystem adapter — allows a real or in-memory store in tests. */
export interface FileStore {
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  archiveFile(srcPath: string, destDir: string): Promise<string>;
}

/** Injectable PDF reader — the real implementation will use the chosen parsing lib. */
export interface PdfReader {
  extract(input: { path?: string; buffer?: Uint8Array }): Promise<{ text: string; pages: number }>;
}

export interface StructurerModel {
  generate(prompt: string): Promise<ExtractedProfile>;
}

export interface JobTriageResult {
  fitScore: number; // 0–100
  isDealbreaker: boolean;
  missingSkills: string[]; // max 5
  matchedKeywords: string[]; // max 10
  atsTitleSuggestion: string;
}

export interface SkillMetadata {
  id: string;
  name: string;
  triggers: string[];
  priority: number;
  filePath: string;
}

export interface DedupVerdict {
  duplicate: boolean;
  reason?: 'CANONICAL_URL' | 'CONTENT_HASH' | 'COMPANY_COOLDOWN';
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  needsReview?: boolean; // e.g.: job with no declared region in international scope
}

export interface LocaleDecision {
  resumeLanguage: 'pt-BR' | 'en-US';
  currency: 'BRL' | 'USD';
  salaryExpectation: number;
}

export interface InspectedField {
  kind: 'input' | 'select' | 'textarea' | 'file' | 'choice';
  label: string;
  required: boolean;
  inShadowDom?: boolean;
  inIframe?: boolean;
  name?: string;
  selector?: string;
  /** Alternatives when `kind==='choice'` (radio group by `name`). */
  options?: Array<{ label: string; value?: string; selector: string }>;
}

export interface FieldMatch {
  field: InspectedField;
  value: string;
  source: 'PROFILE' | 'STANDARD_ANSWER' | 'AI_GENERATED' | 'DEFAULT';
}

export interface BlockingSignal {
  kind: BlockingSignalKind;
  detail: string;
}

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
  attachments: string[]; // file paths
  language: 'pt-BR' | 'en-US';
  fitScore?: number;
}

export interface WhatsappMessage {
  number: string; // digits only, international format
  text: string;
  resumePath?: string;
  language: 'pt-BR' | 'en-US';
}

export interface CareerOpsConfig {
  execution: {
    mode: ExecutionMode;
    minScoreForTailoring: number;
    minScoreForFullAuto: number;
    maxDailyApplications: number;
    companyCooldownDays: number;
    maxJobsPerRun: number;
    minJobsPerRun: number;
    reviewExpirationDays: number;
    escalationTimeoutMinutes: number;
    maxEscalationsPerPlatformPerDay: number;
  };
  discovery: {
    targetTitles: string[];
    sources?: string[];
    excludeSources?: string[];
    regions?: string[];
    workModels?: ('REMOTE' | 'HYBRID' | 'ONSITE')[];
    maxJobsPerSource: number;
    concurrency: number;
    perDomainDelayMs: number;
    searchEngine: 'duckduckgo' | 'bing' | 'none';
    searchResultLimit: number;
    useGenericHtmlFallback: boolean;
    genericExtractionModel: string;
    browserProfileDir?: string;
    /** ATS boards por provedor — env DISCOVERY_ATS_BOARDS (provider:slug). */
    atsBoards?: Record<string, string[]>;
    /** OCR das imagens de posts LinkedIn (default true) — env DISCOVERY_POSTS_OCR. */
    postsImageOcr: boolean;
    respectRobotsTxt: boolean;
    /** Só vagas com Candidatura simplificada (f_AL=true + posts pulados) — env DISCOVERY_LINKEDIN_EASY_APPLY. */
    linkedinEasyApplyOnly?: boolean;
    /** Teto de páginas por listagem (default 4) — env DISCOVERY_LISTING_MAX_PAGES. */
    listingMaxPages?: number;
  };
  ai: {
    local: { provider: string; modelId: string };
    fast: { provider: string; modelId: string };
    smart: { provider: string; modelId: string };
  };
  autofill: {
    questionSimilarityThreshold: number;
    fieldDefaults: Record<string, string>;
  };
  tracking: {
    emailMonitoring: boolean;
    outcomeConfidenceMin: number;
  };
  marketScope: {
    target: MarketScope;
    national: {
      enabled: boolean;
      workModels: WorkModel[];
      allowedCities: string[];
      contracts: ContractType[];
      salaryExpectationBRL: number;
    };
    international: {
      enabled: boolean;
      regions: IntlRegion[];
      blockVisaRequired: boolean;
      salaryExpectationUSD: number;
    };
  };
  salary: {
    adaptToJobRange: boolean;
    byLevel: {
      JUNIOR: { brl: number; usd: number };
      PLENO: { brl: number; usd: number };
      SENIOR: { brl: number; usd: number };
    };
  };
  profile: {
    inboxDir: string;
    draftPath: string;
    masterPath: string;
    compiledPath: string;
    historyDir: string;
  };
  email: {
    enabled: boolean;
    dispatchMode: EmailDispatchMode;
    minScoreAutoSend: number;
    attachTailoredResume: boolean;
    maxDailyEmails: number;
    smtpCredentialRef: string;
    recipientCooldownDays: number;
    maxRetries: number;
    retryBackoffMs: number;
    bodyTemplatePath: string;
    includeSalaryExpectation: boolean;
  };
  whatsapp: {
    enabled: boolean;
    mode: WhatsappMode;
    apiUrlEnv: string;
    apiInstance: string;
    apiKeyEnv: string;
    bodyTemplatePath: string;
    recipientCooldownDays: number;
    attachResume: boolean;
    maxRetries: number;
    retryBackoffMs: number;
  };
}

// ─── Expected src/ signatures (contract documentation) ──────────────────────
//
// src/scraper/domCleaner.ts
//   cleanJobHtml(html: string): { markdown: string; title?: string; company?: string }
//   estimateTokens(text: string): number
//
// src/db/repository.ts
//   class JobRepository { constructor(dbPath|':memory:')
//     dedupCheck(input: {url, company, title, description}, opts?: {companyCooldownDays}): Promise<DedupVerdict>
//     recordJob(job), updateStatus(url, status, resumePath?, pending?), getByUrl(canonicalUrl), close()
//       pending?: {reason?, url?, detail?} → colunas pending_* (limpas quando ausente)
//     hasRecentApplication(company, days): Promise<boolean>
//     findJob(ref: id|url|canonicalUrl): Promise<JobRecord|undefined>
//     deleteJob(ref): Promise<boolean>  — removes job + applications rows
//     markChannelSent(jobId, 'EMAIL'|'WHATSAPP'): Promise<void>
//       — flips pending queue row to APPLIED_VIA_* (sent_at=now) or inserts it }
//
// src/ai/router.ts
//   resolveModel(tier: ModelTier, config): { provider: string; modelId: string }
//
// src/ai/triageAgent.ts
//   JobTriageSchema (zod) · triageJob(input: {jobText, profile}, deps: {model}): Promise<JobTriageResult>
//
// src/ai/tailorerAgent.ts
//   tailorResume(input: {job, triage, skillsBlock, profile}, deps: {model}):
//     Promise<{resumeMarkdown: string; answers: Record<string,string>; resumePath?: string}>
//   slugFilename(id: string): string — job id/título → filename seguro p/ resumePath
//
// src/generator/pdfWriter.ts
//   PdfLine {text; size; bold; gapBefore?; indent?}
//   paginateMarkdown(md: string): PdfLine[][] — coluna única ATS (title/h2/h3/body/bullet, ~92ch)
//   writeSimplePdf(pages: PdfLine[][]): Buffer — PDF 1.4 real (base-14 Helvetica, latin-1)
//
// src/generator/resumeBuilder.ts
//   buildResumePdf({resumeMarkdown, outputPath}): Promise<{filePath}> — grava PDF binário real
//   fallbackResumeMarkdown(profile: MasterProfileLike): string — markdown só com campos do perfil
//
// src/ai/tokenTracker.ts
//   record(usage: {tier, inputTokens, outputTokens, cachedTokens}) · totals() · savingsEstimate()
//
// src/skills/core/skillSelector.ts      → selectRelevantSkills(...)   (see doc 05)
// src/skills/core/skillInjector.ts      → buildSkillsContextBlock(...) (see doc 05)
//
// src/geo/dorkBuilder.ts     buildSearchQueries(config): Array<{engine, query, source}>
// src/geo/eligibilityGuard.ts checkEligibility(job, config): EligibilityResult
// src/geo/localeAdapter.ts   resolveLocale(scope, config): LocaleDecision
//
// src/core/autonomyEngine.ts
//   decideApplicationRoute({fitScore, mode, signals, config, dailyCount}): ApplicationRoute
// src/core/escalationHandler.ts
//   BlockingSignalKind: CAPTCHA | EMAIL_OTP | LOGIN_REQUIRED | UNKNOWN_REQUIRED_FIELD | SESSION_EXPIRED
//   detectBlockingSignal(pageState, ctx?): BlockingSignal | null
//   escalate(page, signal): Promise<{status: 'NEEDS_HUMAN_INPUT'; progressPreserved; savedPageState}>
//   resumeAfterEscalation(savedPageState, {humanResolved}): Promise<{continueFromStep; status}>
// src/core/pipeline.ts
//   runApplicationPipeline(input: {rawJobs, profile, config, dryRun?}, deps: {repo, triageModel,
//     tailorModel, pageFactory(url): PageStateLike|Promise<…>, humanApproval?, humanPace?,
//     onHumanEscalation?({page,signal,jobUrl,matched,aiAnswers,resumePath,unansweredLabels?})
//       →bool — true = página segue aberta; chamado tb p/ UNKNOWN_REQUIRED_FIELD
//     answerQuestions?(questions, ctx{jobTitle,company,jobExcerpt,profileContext})
//       → Record<string,string>|null — LLM ao vivo (SMART) p/ campos sem resposta}):
//     Promise<{processed; applications: Array<{status; stages; resumePath?}>;
//             tokenReport; dryRunReport?}>
//   — respostas ao vivo viram merge no sidecar <resume>.answers.json (retry reusa)
//   — materializa o PDF adaptado (buildResumePdf) sob o home de dados e grava o
//     path absoluto em app.resumePath + jobs.resume_path (persistido p/ retry);
//     falha de gravação → NEEDS_HUMAN_INPUT 'RESUME_PDF_FAILED'
// src/autofill/playwrightExecutor.ts
//   executeLiveFill(page(com .dom real), opts{…, humanPace?}) → ExecuteFillResult
//   submitLivePage(page, humanPace?) → bool (submit pós-aprovação) · closeLivePage(page) → void
// src/scraper/browserManager.ts
//   getJobBrowserContext({headless?, profileDir?, stealth?}) → BrowserContext (cacheado/revalidado)
// src/scraper/pageInspector.ts  inspectPage(page,url)/inspectDom(page) → PageStateLike{dom};
//   snapshotToState(snapshot, url, dom?) — puro, testável sem navegador
//   — input[type=radio] é agrupado por `name` num único campo kind:'choice'
//     com options[] (label/value/seletor por opção) e label = texto da PERGUNTA
//
// src/autofill/deterministicMatcher.ts
//   InspectedField.kind: 'input'|'select'|'textarea'|'file'|'choice' (+ options?)
//   matchFields(fields: InspectedField[], profile): {matched: FieldMatch[]; unmatched: InspectedField[]}
//   — 'choice' casa pela label da PERGUNTA; value retornado = resposta pretendida em texto
// src/autofill/questionAnswerer.ts
//   UnresolvedQuestion {label; kind; options?; required}
//   buildAnswersPrompt({jobTitle, company, jobExcerpt, profileContext, questions}): string
//   parseAnswers(text): Record<string,string> — ignora respostas vazias
// src/ai/modelFactory.ts (delta)
//   LlmClients.answersModel — AnswersModel { answer(prompt) → Record<string,string> }
//     tier SMART + schema {answers: record(string)}; ModelCallStats.stage += 'answers'
// src/autofill/formExecutor.ts
//   PageFieldState.options?: Array<{label; value?; selector}> — alternativas de 'choice'
//   ExecuteFillOptions.answerQuestions?: (questions: UnresolvedQuestion[])
//     → Promise<Record<string,string> | null> — LLM ao vivo, 1 chamada por etapa
//   executeFill(page, opts: {matched?, aiAnswers?, resumePath?, submitMode, answerQuestions?}):
//     Promise<{fieldsFilled, resumeAttached, submitted, status, aiAnswersUsed?, unmatchedHandled?,
//             liveAnswers?, unansweredRequired?}>
// src/autofill/playwrightExecutor.ts
//   executeLiveFill(page(com .dom real), opts{…, humanPace?, answerQuestions?}) → ExecuteFillResult
//   — 'choice' marca a opção via pickOption (exata→contenção→fuzzy→sim/não);
//     required respondida só por resposta ao vivo derruba AUTO_SUBMIT→PAUSE;
//     retorna liveAnswers + unansweredRequired
//   submitLivePage(page, humanPace?) → bool (submit pós-aprovação) · closeLivePage(page) → void
// src/autofill/wizardNavigator.ts
//   evaluateStepResult(stepState): 'ADVANCE' | 'ESCALATE' | 'READY'
//
// src/db/repository.ts (delta)
//   updateStatus(url, status, resumePath?, pending?): Promise<void> — resume_path preserva via COALESCE;
//     pending?: {reason?, url?, detail?} grava pending_* (ausente = limpa)
//
// src/email_application/recipientResolver.ts
//   resolveRecipient(job, deps: {repo, cooldownDays?}): Promise<{email: string} | null>
// src/email_application/emailComposer.ts
//   composeEmail({job, profile, skills, resumePath, baseResumePath, locale, fitScore?,
//     bodyTemplatePath?, includeSalaryExpectation?}): Promise<EmailDraft>
// src/email_application/emailDispatcher.ts
//   dispatchEmail(draft, deps: {transport, vault, config: {dispatchMode, smtpCredentialRef,
//     minScoreAutoSend?, maxRetries?, retryBackoffMs?}}):
//     Promise<{sent: boolean; status?: JobStatus; attempts?: number}>
// src/email_application/credentialVault.ts
//   class FileCredentialVault implements CredentialVault { getCredential|setCredential|has|list|remove }
// src/email_application/smtpTransport.ts
//   createSmtpTransport({vault, ref, transportFactory?}): SmtpTransport  (nodemailer real)
// src/email_application/emailAppCore.ts
//   applyViaEmail(input: EmailApplyInput, deps: {repo, transport?, vault?, config: email}):
//     Promise<{sent, status, reason?, attempts?}>
//
// src/whatsapp_application/whatsappResolver.ts
//   resolveWhatsappRecipient(job, deps: {repo, cooldownDays?}): Promise<{number} | null>
// src/whatsapp_application/whatsappComposer.ts
//   composeWhatsapp(input): Promise<WhatsappMessage>  (text + resumePath)
// src/whatsapp_application/evolutionClient.ts
//   createEvolutionClient({apiUrl, apiKey, instance, fetchImpl?}): EvolutionTransport
// src/whatsapp_application/whatsappAppCore.ts
//   applyViaWhatsapp(input, deps: {repo, transport?, config: whatsapp}):
//     Promise<{sent, status, reason?, message?, attempts?}>
//
// src/tracker/outcomeMonitor.ts
//   classifyOutcome(message: {from, subject, body}, appliedSenders: string[]): OutcomeStatus | null
//
// src/intake/pdfExtractor.ts
//   extractPdfText(file: {path?|buffer?}, deps: {reader: PdfReader}): Promise<PdfExtractionResult>
//
// src/intake/profileStructurer.ts
//   MasterProfileSchema (zod)
//   structureProfile(input: {documentText: string}, deps: {model: StructurerModel}): Promise<ExtractedProfile>
//
// src/intake/masterProfileStore.ts
//   class MasterProfileStore { constructor(paths: {draftPath, masterPath, historyDir}, deps: {fs: FileStore})
//     saveDraft(profile: ExtractedProfile, opts: {mode: ProfileImportMode; base?: MasterProfile}):
//       Promise<{draftPath: string; conflicts: ProfileConflict[]}>
//     getActiveProfileMarkdown(): Promise<string | null>
//     getDraftMarkdown(): Promise<string | null>
//     promoteDraft(): Promise<{activated: true; archivedTo?: string}> }
//
// src/intake/profileCompiler.ts
//   compileMasterProfile(markdown: string): CompileResult
//   invalidateDerivedData(): ProfileInvalidation
//
// src/intake/intakeCore.ts
//   importResume(input: {file: {path?|buffer?}; mode: ProfileImportMode; source: ProfileImportSource},
//     deps: {reader: PdfReader; model: StructurerModel; store: MasterProfileStore}):
//     Promise<{outcome: IntakeOutcome; draftPath?: string; alert?: string; conflicts?: ProfileConflict[]}>
//   approveProfileDraft(deps: {store: MasterProfileStore}): Promise<{activated: true} & ProfileInvalidation>
//   processInbox(input: {inboxDir; mode}, deps: ImportResumeDeps & {scanner: InboxScanner}):
//     Promise<{scanned: number; results: Array<ImportResumeResult & {path; archivedTo?}>}>
//
// src/utils/runtimeModules.ts (runtime sidecar do exe SEA — career-runtime/)
//   isSea(): boolean · exeDir(): string
//   runtimeDirCandidates(env?): string[] — CAREER_RUNTIME → <exe>/career-runtime → packageRoot
//   runtimeDir(env?): string | null — primeiro candidato com node_modules
//   loadRuntimeModule<T>(name, env?): Promise<T> — dev: import(name); SEA: createRequire(candidato)
//   ensureBrowserRuntimeEnv(env?): void — PLAYWRIGHT_BROWSERS_PATH → <runtime>/browsers
//   tessdataDir(env?): string | null — <runtime>/tessdata
// src/config/paths.ts (âncora de dados)
//   careerHome(env?, {exeDir?}): string — CAREER_HOME relativo ancora em exeDir (SEA portátil)
//   resolveHome(rel, env?, {exeDir?}): string · envFilePath(env?, {exeDir?}): string
// src/config/loadConfig.ts
//   LoadConfigOptions {env?, envFile?, exeDir?} — exeDir habilita <exe>/.env na cadeia:
//   <home>/.env < ./.env (cwd) < <exe>/.env < process.env

//
// src/ui/ (interface gráfica local — feature/17)
//   index.ts    serveUi({port?, open?, exeDir?}): Promise<UiServerHandle>
//               openBrowser(url): void
//   server.ts   createUiServer(deps: {token, exeDir?}): Server
//               listenUi(deps, port): Promise<{url, port, token, close()}>
//               — bind 127.0.0.1; /api/* exige X-UI-Token ou ?token= (timing-safe)
//   auth.ts     newUiToken(): string(48-hex) — tokenOk(req, expected): boolean
//   readUiAsset.ts readUiAsset(rel): Buffer|null — fs dev / sea.getAsset("ui/<rel>") no exe
//   envMap.ts   listEnvEntries({exeDir?, envFile?, env?}): {entries, homeEnvFile, cwdEnvFile, exeEnvFile?}
//               EnvEntry {key, value, source: home|cwd|exe|process, masked}
//               — segredos (API_KEY|_KEY|SECRET|PASSWORD|TOKEN…) saem mascarados
//   tasks.ts    startTask(argv): UiTask — subprocesso do próprio binário
//               (SEA: process.execPath; dev: node --import tsx src/cli/index.ts)
//               UiTask {id, argv, status: running|done|error|killed, startedAt, exitCode}
//               subscribeTask(id, onChunk, onClose): unsubscribe|null (replay do buffer)
//               taskInput/killTask/listTasks/getTask; bloqueia argv de ui|serve|exit|repl|shell
//   api.ts      handleApi(req,res,{token,exeDir?}): Promise<boolean>
//               GET /api/meta · GET|PUT|DELETE /api/env[/:key] (env mascarado+fonte,
//               escrita no <home>/.env via envFile.ts) · GET /api/runtime ·
//               GET /api/status · GET /api/jobs?status&q&limit · GET /api/jobs/queue ·
//               POST /api/jobs/:id/status|remove · POST /api/tasks {argv} ·
//               GET /api/tasks/:id/events (SSE) · POST /api/tasks/:id/input|kill ·
//               GET|PUT|DELETE /api/vault[/:ref] (só refs — nunca segredos) ·
//               GET|PUT /api/profile (master.md + recompila compiledPath) ·
//               POST /api/profile/import {name,dataB64} → inboxDir
//   cli: 'career ui [--port N] [--no-open]' abre o browser; 'career serve' é headless
//        (o app desktop Tauri spawn e conecta a webview — desktop/src-tauri)
