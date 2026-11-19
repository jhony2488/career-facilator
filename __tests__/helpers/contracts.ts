/**
 * CONTRATOS PROVISÓRIOS — CareerFacilator AI
 *
 * Este arquivo centraliza os tipos de domínio e as assinaturas esperadas dos
 * módulos de `src/`, derivados de docs/pt-BR/ e feature/*.feature.
 *
 * Os testes importam TIPOS daqui e FUNÇÕES de `../src/`. Enquanto `src/` não
 * existir, os testes não compilam — comportamento intencional (TDD/red-first).
 * Quando a implementação começar, ela deve satisfazer estas assinaturas;
 * divergências devem ser discutidas aqui antes de mudar os testes.
 *
 * Rastreabilidade: cada `it()` nos testes referencia o cenário .feature de
 * origem via comentário `// feature/NN: <nome do cenário>`.
 */

// ─── Enums / unions de domínio ──────────────────────────────────────────────

export type JobStatus =
  | 'DISCOVERED'
  | 'TRIAGED'
  | 'SKIPPED'
  | 'TAILORED'
  | 'READY_TO_REVIEW'
  | 'APPLIED'
  | 'APPLIED_VIA_EMAIL'
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
export type OutcomeStatus = 'REJECTED' | 'ASSESSMENT_INVITED' | 'INTERVIEW';
export type ApplicationRoute = 'AUTO_SEND' | 'REVIEW' | 'DEFER' | 'ESCALATE';
export type BlockingSignalKind =
  'CAPTCHA' | 'EMAIL_OTP' | 'UNKNOWN_REQUIRED_FIELD' | 'SESSION_EXPIRED';
export type ProfileImportSource = 'INBOX' | 'CLI';
export type ProfileImportMode = 'MERGE' | 'REPLACE';
export type IntakeOutcome = 'DRAFT_PENDING_REVIEW' | 'UNREADABLE_DOCUMENT';

/** Sentinela para campos ausentes no documento — nunca inferidos (docs/pt-BR/13). */
export const NOT_INFORMED = 'NÃO_INFORMADO';

// ─── Entidades ──────────────────────────────────────────────────────────────

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
 * Resultado da estruturação de um documento (feature/13).
 * Campos de texto ausentes vêm como NOT_INFORMED; numéricos ausentes como null —
 * o sistema nunca infere valores que não constam no documento.
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
  hasTextLayer: boolean; // false → PDF digitalizado/corrompido, sinalizar sem inventar
  pageCount: number;
}

export interface ProfileConflict {
  field: string;
  existing: string;
  incoming: string;
}

export interface CompileResult {
  profile: MasterProfile;
  warnings: string[]; // seções fora do padrão são sinalizadas, nunca "corrigidas" com invenção
}

export interface ProfileInvalidation {
  cacheInvalidated: boolean;
  scoresToRecalculate: boolean;
}

/** Adaptador de filesystem injetável — permite store real ou in-memory nos testes. */
export interface FileStore {
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  archiveFile(srcPath: string, destDir: string): Promise<string>;
}

/** Leitor de PDF injetável — a implementação real usará a lib de parsing escolhida. */
export interface PdfReader {
  extract(input: { path?: string; buffer?: Uint8Array }): Promise<{ text: string; pages: number }>;
}

export interface StructurerModel {
  generate(prompt: string): Promise<ExtractedProfile>;
}

export interface JobTriageResult {
  fitScore: number; // 0–100
  isDealbreaker: boolean;
  missingSkills: string[]; // máx 5
  matchedKeywords: string[]; // máx 10
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
  needsReview?: boolean; // ex: vaga sem região declarada no escopo internacional
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
  attachments: string[]; // caminhos de arquivo
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
}

// ─── Assinaturas esperadas de src/ (documentação de contrato) ───────────────
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
// src/skills/core/skillSelector.ts      → selectRelevantSkills(...)   (ver doc 05)
// src/skills/core/skillInjector.ts      → buildSkillsContextBlock(...) (ver doc 05)
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
