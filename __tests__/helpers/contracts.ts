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
  kind: 'input' | 'select' | 'textarea' | 'file';
  label: string;
  required: boolean;
  inShadowDom?: boolean;
  inIframe?: boolean;
}

export interface FieldMatch {
  field: InspectedField;
  value: string;
  source: 'PROFILE' | 'STANDARD_ANSWER' | 'AI_GENERATED';
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
    reviewExpirationDays: number;
    escalationTimeoutMinutes: number;
    maxEscalationsPerPlatformPerDay: number;
  };
  discovery: {
    targetTitles: string[];
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
//     recordJob(job), updateStatus(url, status), getByUrl(canonicalUrl), close()
//     hasRecentApplication(company, days): Promise<boolean> }
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
//   detectBlockingSignal(pageState, ctx?): BlockingSignal | null
//   escalate(page, signal): Promise<{status: 'NEEDS_HUMAN_INPUT'; progressPreserved; savedPageState}>
//   resumeAfterEscalation(savedPageState, {humanResolved}): Promise<{continueFromStep; status}>
// src/core/pipeline.ts
//   runApplicationPipeline(input: {rawJobs, profile, config, dryRun?}, deps: {repo, triageModel,
//     tailorModel, pageFactory, humanApproval?}):
//     Promise<{processed; applications: Array<{status; stages; resumePath?}>;
//             tokenReport; dryRunReport?}>
//
// src/autofill/deterministicMatcher.ts
//   matchFields(fields: InspectedField[], profile): {matched: FieldMatch[]; unmatched: InspectedField[]}
// src/autofill/formExecutor.ts
//   executeFill(page, opts: {matched?, aiAnswers?, resumePath?, submitMode}):
//     Promise<{fieldsFilled, resumeAttached, submitted, status, aiAnswersUsed?, unmatchedHandled?}>
// src/autofill/wizardNavigator.ts
//   evaluateStepResult(stepState): 'ADVANCE' | 'ESCALATE' | 'READY'
//
// src/email_application/recipientResolver.ts
//   resolveRecipient(job, deps: {repo}): Promise<{email: string} | null>
// src/email_application/emailComposer.ts
//   composeEmail({job, profile, skills, resumePath, locale}): Promise<EmailDraft>
// src/email_application/emailDispatcher.ts
//   dispatchEmail(draft, deps: {transport, vault, config: {dispatchMode, smtpCredentialRef}}):
//     Promise<{sent: boolean; status?: JobStatus; retryScheduled?: boolean}>
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
