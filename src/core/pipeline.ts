import { cleanJobHtml } from '../scraper/domCleaner';
import { triageJob, type TriageModel, type JobTriageResult } from '../ai/triageAgent';
import { tailorResume, type TailorModel } from '../ai/tailorerAgent';
import { selectRelevantSkills } from '../skills/core/skillSelector';
import { buildSkillsContextBlock } from '../skills/core/skillInjector';
import type { SkillMetadata } from '../skills/core/skillRegistry';
import { checkEligibility } from '../geo/eligibilityGuard';
import { decideApplicationRoute } from './autonomyEngine';
import { matchFields, type InspectedField } from '../autofill/deterministicMatcher';
import { executeFill, type PageStateLike, type SubmitMode } from '../autofill/formExecutor';
import { detectBlockingSignal, escalate } from './escalationHandler';
import { resolveRecipient } from '../email_application/recipientResolver';
import { composeEmail } from '../email_application/emailComposer';
import {
  dispatchEmail,
  type SmtpTransport,
  type CredentialVault,
} from '../email_application/emailDispatcher';
import { resolveLocale } from '../geo/localeAdapter';
import type { JobRepository, JobStatus } from '../db/repository';
import type { CareerOpsConfig } from '../config/careerOps.config';
import type { MasterProfileLike } from './types';
import { computeLexicalFit, profileFitTerms } from './lexicalMatch';
import {
  chunkProfile,
  retrieveRelevant,
  buildProfileContext,
  type ProfileChunk,
} from '../ai/rag/profileRetriever';

export interface RawJobInput {
  html: string;
  url: string;
}

export interface PipelineInput {
  rawJobs: RawJobInput[];
  profile: MasterProfileLike;
  config: CareerOpsConfig;
  dryRun?: boolean;
}

export interface PipelineDeps {
  repo: Pick<JobRepository, 'dedupCheck' | 'recordJob' | 'updateStatus' | 'hasEmailSentTo'>;
  triageModel: TriageModel;
  tailorModel: TailorModel;
  pageFactory: () => PageStateLike;
  skills?: SkillMetadata[];
  humanApproval?: (context: { job: RawJobInput; fitScore: number }) => boolean;
  emailTransport?: SmtpTransport;
  vault?: CredentialVault;
  /**
   * Retriever de contexto do perfil (RAG). Recebe chunks + query da vaga e
   * devolve os trechos relevantes. Default: retrieveRelevant (léxico, 0 deps).
   */
  retriever?: (chunks: ProfileChunk[], keywords: string[], jobText: string) => Promise<ProfileChunk[]>;
}

export interface ApplicationResult {
  url: string;
  status: JobStatus;
  stages: JobStatus[];
  fitScore?: number;
  skillsActivated?: string[];
  resumePath?: string;
  reason?: string;
}

export interface TokenReport {
  smartTierCalls: number;
  triageCalls: number;
}

export interface DryRunJobReport {
  url: string;
  fitScore?: number;
  intendedRoute?: string;
  skillsActivated: string[];
}

export interface PipelineResult {
  processed: number;
  applications: ApplicationResult[];
  tokenReport: TokenReport;
  dryRunReport?: { jobs: DryRunJobReport[] };
}

/**
 * Orquestrador do funil (doc 02/09/12): discovery → dedup → eligibility →
 * triage → skills → tailor → autofill/e-mail → autonomy → dispatch.
 * Toda dependência externa chega por injeção (repo, modelos, página, transporte).
 */
export async function runApplicationPipeline(
  input: PipelineInput,
  deps: PipelineDeps,
): Promise<PipelineResult> {
  const { profile, config, dryRun = false } = input;
  const applications: ApplicationResult[] = [];
  const dryRunJobs: DryRunJobReport[] = [];
  const tokenReport: TokenReport = { smartTierCalls: 0, triageCalls: 0 };
  let dailySent = 0;

  for (const raw of input.rawJobs) {
    const stages: JobStatus[] = ['DISCOVERED'];
    const app: ApplicationResult = {
      url: raw.url,
      status: 'DISCOVERED',
      stages,
      skillsActivated: [],
    };

    // 1. Limpeza de contexto — Camada 0 (0 tokens)
    const clean = cleanJobHtml(raw.html, raw.url);
    const markdown = clean.markdown;

    // 2. Deduplicação em 3 níveis — antes de qualquer IA
    const dup = await deps.repo.dedupCheck({
      url: raw.url,
      company: clean.company ?? 'unknown',
      title: clean.title ?? 'unknown',
      descriptionMarkdown: markdown,
    });
    if (dup.duplicate) {
      stages.push('SKIPPED');
      Object.assign(app, { status: 'SKIPPED', reason: dup.reason });
      applications.push(app);
      continue;
    }

    // 3. Filtro léxico determinístico — palavras bloqueadas do perfil
    const lower = markdown.toLowerCase();
    if (profile.blockedKeywords.some((k) => lower.includes(k.toLowerCase()))) {
      stages.push('SKIPPED');
      Object.assign(app, { status: 'SKIPPED', reason: 'BLOCKED_KEYWORD' });
      applications.push(app);
      continue;
    }

    // 3b. Filtro léxico — aderência Camada 0 (0 tokens): corta vagas sem
    // overlap de stack antes de gastar inferência de modelo.
    const minLex = config.execution.lexicalMinTerms ?? 1;
    if (minLex > 0) {
      const fit = computeLexicalFit(markdown, profileFitTerms(profile));
      if (fit.matchedTerms.length < minLex) {
        stages.push('SKIPPED');
        Object.assign(app, { status: 'SKIPPED', reason: 'LOW_LEXICAL_FIT' });
        applications.push(app);
        continue;
      }
    }

    // 4. Elegibilidade geográfica/contratual
    const scope = detectScope(markdown);
    const eligibility = checkEligibility({ scope, descriptionMarkdown: markdown }, config);
    if (!eligibility.eligible) {
      stages.push('SKIPPED');
      Object.assign(app, { status: 'SKIPPED', reason: eligibility.reason });
      applications.push(app);
      continue;
    }

    // Vaga inédita → persiste como DISCOVERED para rastrear a máquina de estados
    await deps.repo.recordJob({
      id: `${clean.company ?? 'job'}-${raw.url}`,
      url: raw.url,
      source: 'ATS_DIRECT',
      company: clean.company ?? 'unknown',
      title: clean.title ?? 'unknown',
      descriptionMarkdown: markdown,
      scope,
      status: 'DISCOVERED',
      discoveredAt: new Date().toISOString(),
    });

    // 5. Triagem IA — Camada 1
    tokenReport.triageCalls++;
    const triage: JobTriageResult = await triageJob(
      { jobText: markdown, profile },
      { model: deps.triageModel },
    );
    app.fitScore = triage.fitScore;
    stages.push('TRIAGED');

    if (triage.isDealbreaker || triage.fitScore < config.execution.minScoreForTailoring) {
      stages.push('SKIPPED');
      Object.assign(app, {
        status: 'SKIPPED',
        reason: triage.isDealbreaker ? 'DEALBREAKER' : 'LOW_FIT_SCORE',
      });
      applications.push(app);
      continue;
    }

    // 6. Skills dinâmicas — seleção determinística (0 tokens)
    const skills = selectRelevantSkills(triage.matchedKeywords, deps.skills ?? []);
    app.skillsActivated = skills.map((s) => s.id);
    const skillsBlock = await buildSkillsContextBlock(skills);

    // 7. Geração de ativos — Camada 2 (prompt caching + RAG do perfil)
    tokenReport.smartTierCalls++;
    const retrieve =
      deps.retriever ??
      ((chunks: ProfileChunk[], keywords: string[], jobText: string) =>
        Promise.resolve(retrieveRelevant(chunks, { keywords, jobText })));
    const relevantChunks = await retrieve(
      chunkProfile(profile),
      triage.matchedKeywords,
      markdown,
    );
    const assets = await tailorResume(
      {
        job: {
          id: clean.title ?? raw.url,
          title: clean.title ?? '',
          company: clean.company ?? '',
          descriptionMarkdown: markdown,
        },
        triage,
        skillsBlock,
        profile,
        profileContext: buildProfileContext(relevantChunks),
      },
      { model: deps.tailorModel },
    );
    app.resumePath = assets.resumePath;
    stages.push('TAILORED');

    // 8. Motor de autonomia
    const route = decideApplicationRoute({
      fitScore: triage.fitScore,
      mode: config.execution.mode,
      signals: { hasCaptcha: false, hasLowConfidenceAnswers: false },
      config,
      dailyCount: dailySent,
    });

    if (dryRun) {
      dryRunJobs.push({
        url: raw.url,
        fitScore: triage.fitScore,
        intendedRoute: route,
        skillsActivated: app.skillsActivated!,
      });
      Object.assign(app, { status: 'DRY_RUN' as JobStatus });
      applications.push(app);
      continue;
    }

    // Persiste a vaga inédita como DISCOVERED para rastrear a máquina de estados
    await deps.repo.recordJob({
      id: clean.title ?? raw.url,
      url: raw.url,
      source: 'ATS_DIRECT',
      company: clean.company ?? 'unknown',
      title: clean.title ?? 'unknown',
      descriptionMarkdown: markdown,
      scope,
      status: 'DISCOVERED',
      discoveredAt: new Date().toISOString(),
    });

    if (route === 'DEFER') {
      stages.push('DEFERRED');
      Object.assign(app, { status: 'DEFERRED' });
      applications.push(app);
      continue;
    }
    if (route === 'ESCALATE') {
      stages.push('NEEDS_HUMAN_INPUT');
      Object.assign(app, { status: 'NEEDS_HUMAN_INPUT' });
      applications.push(app);
      continue;
    }

    // 9. Canal: formulário web vs. e-mail
    const page = deps.pageFactory();
    const hasWebForm = page.fields.length > 0;

    if (!hasWebForm) {
      await applyViaEmail(
        raw,
        clean.company ?? '',
        clean.title ?? '',
        markdown,
        assets.resumePath,
        skills,
        profile,
        config,
        app,
        stages,
        deps,
        dryRun,
      );
      applications.push(app);
      if (app.status === 'APPLIED_VIA_EMAIL') dailySent++;
      continue;
    }

    // Detecção visual: plataforma já sinaliza candidatura enviada
    if (page.alreadyAppliedBanner) {
      await deps.repo.updateStatus(raw.url, 'APPLIED');
      stages.push('APPLIED');
      Object.assign(app, { status: 'APPLIED', reason: 'ALREADY_APPLIED_BANNER' });
      applications.push(app);
      continue;
    }

    // 10. Autofill: match determinístico + respostas IA para unmatched
    const inspected: InspectedField[] = page.fields.map((f) => ({
      kind: f.kind as InspectedField['kind'],
      label: f.label,
      required: f.required,
    }));
    const { matched, unmatched } = matchFields(inspected, profile);
    const unmatchedRequired = unmatched.filter((f) => f.required && !assets.answers[f.label]);

    const fill = await executeFill(page, {
      matched,
      aiAnswers: assets.answers,
      resumePath: assets.resumePath,
      submitMode: (route === 'AUTO_SEND' ? 'AUTO_SUBMIT' : 'PAUSE_BEFORE_SUBMIT') as SubmitMode,
    });

    // 11. Escalonamento por bloqueio detectado na página ou campo desconhecido
    const signal = detectBlockingSignal(page, {
      unmatchedRequiredLabels: unmatchedRequired.map((f) => f.label),
    });
    if (signal || fill.escalated) {
      await escalate(
        page,
        signal ?? { kind: 'UNKNOWN_REQUIRED_FIELD', detail: 'bloqueio no preenchimento' },
      );
      stages.push('NEEDS_HUMAN_INPUT');
      Object.assign(app, { status: 'NEEDS_HUMAN_INPUT' });
      applications.push(app);
      continue;
    }

    if (fill.status === 'READY_TO_REVIEW') {
      stages.push('READY_TO_REVIEW');
      const approved = deps.humanApproval?.({ job: raw, fitScore: triage.fitScore }) ?? false;
      if (!approved) {
        Object.assign(app, { status: 'READY_TO_REVIEW' });
        applications.push(app);
        continue;
      }
      page.submitted = true;
    }

    await deps.repo.updateStatus(raw.url, 'APPLIED');
    stages.push('APPLIED');
    dailySent++;
    Object.assign(app, { status: 'APPLIED' });
    applications.push(app);
  }

  const result: PipelineResult = {
    processed: applications.length,
    applications,
    tokenReport,
  };
  if (dryRun) result.dryRunReport = { jobs: dryRunJobs };
  return result;
}

function detectScope(markdown: string): 'NATIONAL' | 'INTERNATIONAL' {
  return /remoto|brasil|brazil|clt|\bpj\b|pretens[ãa]o/i.test(markdown)
    ? 'NATIONAL'
    : 'INTERNATIONAL';
}

async function applyViaEmail(
  raw: RawJobInput,
  company: string,
  title: string,
  markdown: string,
  resumePath: string | undefined,
  skills: SkillMetadata[],
  profile: MasterProfileLike,
  config: CareerOpsConfig,
  app: ApplicationResult,
  stages: JobStatus[],
  deps: PipelineDeps,
  dryRun: boolean,
): Promise<void> {
  const recipient = await resolveRecipient({ descriptionMarkdown: markdown }, { repo: deps.repo });
  if (!recipient || !deps.emailTransport || !deps.vault) {
    stages.push('NEEDS_HUMAN_INPUT');
    Object.assign(app, { status: 'NEEDS_HUMAN_INPUT', reason: 'NO_CHANNEL' });
    return;
  }

  const draft = await composeEmail({
    job: { title, company },
    recipient,
    profile,
    skills,
    resumePath,
    baseResumePath: 'storage/master_resume.pdf',
    locale: resolveLocale('INTERNATIONAL', config),
  });

  if (dryRun) {
    Object.assign(app, { status: 'DRY_RUN' });
    return;
  }

  const dispatched = await dispatchEmail(draft, {
    transport: deps.emailTransport,
    vault: deps.vault,
    config: { dispatchMode: 'AUTO_SEND_HIGH_FIT', smtpCredentialRef: 'smtp-main' },
  });

  if (dispatched.sent) {
    stages.push('APPLIED_VIA_EMAIL');
    Object.assign(app, { status: 'APPLIED_VIA_EMAIL' });
  } else {
    stages.push(dispatched.status ?? 'FAILED');
    Object.assign(app, { status: dispatched.status ?? 'FAILED' });
  }
}
