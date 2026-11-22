import { cleanJobHtml } from '../scraper/domCleaner';
import { triageJob, type TriageModel, type JobTriageResult } from '../ai/triageAgent';
import { tailorResume, type TailorModel } from '../ai/tailorerAgent';
import { selectRelevantSkills } from '../skills/core/skillSelector';
import { buildSkillsContextBlock } from '../skills/core/skillInjector';
import type { SkillMetadata } from '../skills/core/skillRegistry';
import { checkEligibility } from '../geo/eligibilityGuard';
import { decideApplicationRoute } from './autonomyEngine';
import {
  matchFields,
  type FieldMatch,
  type InspectedField,
} from '../autofill/deterministicMatcher';
import { executeFill, type PageStateLike, type SubmitMode } from '../autofill/formExecutor';
import { writeAnswers } from '../autofill/answersStore';
import { closeLivePage, executeLiveFill, submitLivePage } from '../autofill/playwrightExecutor';
import { detectBlockingSignal, escalate, type BlockingSignal } from './escalationHandler';
import { applyViaEmail } from '../email_application/emailAppCore';
import type { SmtpTransport, CredentialVault } from '../email_application/emailDispatcher';
import { applyViaWhatsapp } from '../whatsapp_application/whatsappAppCore';
import type { EvolutionTransport } from '../whatsapp_application/evolutionClient';
import { resolveLocale } from '../geo/localeAdapter';
import { resolveSalaryExpectation } from './salaryResolver';
import type { JobRepository, JobStatus } from '../db/repository';
import { resolveHome } from '../config/paths';
import type { CareerOpsConfig } from '../config/careerOps.config';
import type { MasterProfileLike } from './types';
import { computeLexicalFit, profileFitTerms } from './lexicalMatch';
import { matchTargetTitle, type TitleMatch } from './titleMatcher';
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
  repo: Pick<
    JobRepository,
    | 'dedupCheck'
    | 'recordJob'
    | 'updateStatus'
    | 'hasEmailSentTo'
    | 'recordEmailApplication'
    | 'countEmailsSentToday'
    | 'hasWhatsappSentTo'
    | 'recordWhatsappApplication'
  >;
  triageModel: TriageModel;
  tailorModel: TailorModel;
  /** URL da vaga → estado da página (mock em testes, Playwright em runtime). */
  pageFactory: (url: string) => PageStateLike | Promise<PageStateLike>;
  skills?: SkillMetadata[];
  humanApproval?: (context: { job: RawJobInput; fitScore: number }) => boolean;
  emailTransport?: SmtpTransport;
  vault?: CredentialVault;
  /** Transporte da Evolution API — só necessário em WHATSAPP_MODE=EVOLUTION_API. */
  evolutionTransport?: EvolutionTransport;
  /**
   * Retriever de contexto do perfil (RAG). Recebe chunks + query da vaga e
   * devolve os trechos relevantes. Default: retrieveRelevant (léxico, 0 deps).
   */
  retriever?: (
    chunks: ProfileChunk[],
    keywords: string[],
    jobText: string,
  ) => Promise<ProfileChunk[]>;
  /**
   * Matcher de título da vaga contra discovery.targetTitles — default: camada
   * determinística (matchTargetTitle). Com embeddings ativos, injetar
   * createSemanticTitleMatcher p/ fallback probabilístico.
   */
  titleMatcher?: (jobTitle: string) => Promise<TitleMatch | null> | TitleMatch | null;
  /**
   * Ritmo humano nas interações DOM reais (mouse em curva + digitação) —
   * default true; `false` p/ interações instantâneas (AUTOFILL_HUMAN_PACE).
   */
  humanPace?: boolean;
  /**
   * Escalão visível (feature/09): chamado em CAPTCHA/EMAIL_OTP antes do
   * NEEDS_HUMAN_INPUT — o chamador pode reabrir a página num browser visível
   * p/ o humano resolver na hora. `true` = pipeline não fecha a página
   * (o chamador assumiu posse dela). Default: nada (fecha como sempre).
   */
  onHumanEscalation?: (ctx: {
    page: PageStateLike;
    signal: BlockingSignal;
    /** URL original da vaga — `page.url` pode ser o muro (signin) pós followApplyLink. */
    jobUrl: string;
    matched: FieldMatch[];
    aiAnswers: Record<string, string>;
    resumePath?: string;
  }) => Promise<boolean>;
  /** `AUTOFILL_DEBUG_FILL` — loga campo→valor→fonte no fill web. */
  debugFill?: boolean;
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

    // Falha numa chamada de modelo (timeout, provider down) derruba só esta
    // vaga — FAILED no tracker e o ciclo segue para as demais.
    try {
      // 5. Triagem IA — Camada 1
      tokenReport.triageCalls++;
      const titleMatch = deps.titleMatcher
        ? await deps.titleMatcher(clean.title ?? '')
        : matchTargetTitle(clean.title ?? '', config.discovery.targetTitles);
      const triage: JobTriageResult = await triageJob(
        {
          jobText: markdown,
          profile,
          targetTitles: config.discovery.targetTitles,
          ...(titleMatch ? { titleMatch: titleMatch.target } : {}),
        },
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
          resumeLanguage: resolveLocale(scope, config).resumeLanguage,
        },
        { model: deps.tailorModel },
      );
      app.resumePath = assets.resumePath;
      // Respostas do tailor vão p/ sidecar — o retry reusa em vez de
      // deixar os campos em branco (decisão #30).
      if (assets.resumePath && Object.keys(assets.answers).length) {
        writeAnswers(assets.resumePath, assets.answers);
      }
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

      // 9. Canal: formulário web vs. e-mail — pageFactory devolve página
      // real (Playwright, dom) ou stub; finally garante fechar a página.
      const page = await deps.pageFactory(raw.url);
      let keepPageOpen = false;
      try {
        // Dropzone de CV conta como form — o fill anexa mesmo sem outros campos.
        const hasWebForm = page.fields.length > 0 || (page.dropzones?.length ?? 0) > 0;

        if (!hasWebForm) {
          await applyViaMessageChannel(
            raw,
            clean.company ?? '',
            clean.title ?? '',
            markdown,
            scope,
            assets.resumePath,
            skills,
            profile,
            config,
            triage.fitScore,
            app,
            stages,
            deps,
            dryRun,
          );
          await deps.repo.updateStatus(raw.url, app.status);
          applications.push(app);
          if (app.status === 'APPLIED_VIA_EMAIL' || app.status === 'APPLIED_VIA_WHATSAPP') {
            dailySent++;
          }
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
          name: f.name,
          selector: f.selector,
        }));
        const { matched, unmatched } = matchFields(inspected, profile);
        const unmatchedRequired = unmatched.filter((f) => f.required && !assets.answers[f.label]);
        // Resposta de campo REQUIRED vinda só do modelo = baixa confiança —
        // anti-fabricação: revisão em vez de auto-envio (mesmo em FULL_AUTO).
        const lowConfidence = unmatched.some(
          (f) => f.required && assets.answers[f.label] !== undefined,
        );
        const submitMode = (
          route === 'AUTO_SEND' && !lowConfidence ? 'AUTO_SUBMIT' : 'PAUSE_BEFORE_SUBMIT'
        ) as SubmitMode;

        const fill = await (page.dom
          ? executeLiveFill(page, {
              matched,
              aiAnswers: assets.answers,
              resumePath: assets.resumePath,
              submitMode,
              humanPace: deps.humanPace,
              debug: deps.debugFill,
            })
          : executeFill(page, {
              matched,
              aiAnswers: assets.answers,
              resumePath: assets.resumePath,
              submitMode,
            }));

        // 11. Escalonamento por bloqueio detectado na página ou campo desconhecido
        const signal = detectBlockingSignal(page, {
          unmatchedRequiredLabels: unmatchedRequired.map((f) => f.label),
        });
        if (signal || fill.escalated) {
          const effSignal: BlockingSignal = signal ?? {
            kind: 'UNKNOWN_REQUIRED_FIELD',
            detail: 'bloqueio no preenchimento',
          };
          await escalate(page, effSignal);
          // CAPTCHA/OTP/login em página real → chamador pode reabrir visível
          // p/ o humano resolver na hora (true = página segue aberta fora do pipeline).
          if (
            (effSignal.kind === 'CAPTCHA' ||
              effSignal.kind === 'EMAIL_OTP' ||
              effSignal.kind === 'LOGIN_REQUIRED') &&
            deps.onHumanEscalation
          ) {
            keepPageOpen = await deps
              .onHumanEscalation({
                page,
                signal: effSignal,
                jobUrl: raw.url,
                matched,
                aiAnswers: assets.answers,
                resumePath: assets.resumePath,
              })
              .catch(() => false);
          }
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
          // Página real: a aprovação humana dispara o submit definitivo no DOM
          if (page.dom && !(await submitLivePage(page, deps.humanPace !== false))) {
            stages.push('NEEDS_HUMAN_INPUT');
            Object.assign(app, { status: 'NEEDS_HUMAN_INPUT', reason: 'SUBMIT_CLICK_FAILED' });
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
      } finally {
        if (!keepPageOpen) await closeLivePage(page);
      }
    } catch (e) {
      await deps.repo.updateStatus(raw.url, 'FAILED').catch(() => {});
      stages.push('FAILED');
      Object.assign(app, {
        status: 'FAILED',
        reason: e instanceof Error ? e.message.slice(0, 200) : String(e),
      });
      applications.push(app);
    }
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

/**
 * Canal de mensagem para vagas sem formulário web (docs 11/15): e-mail primeiro
 * (respeitando o teto diário), depois WhatsApp — qualquer NO_CHANNEL cai para a
 * próxima opção; sem nenhum canal → NEEDS_HUMAN_INPUT.
 */
async function applyViaMessageChannel(
  raw: RawJobInput,
  company: string,
  title: string,
  markdown: string,
  scope: 'NATIONAL' | 'INTERNATIONAL',
  resumePath: string | undefined,
  skills: SkillMetadata[],
  profile: MasterProfileLike,
  config: CareerOpsConfig,
  fitScore: number,
  app: ApplicationResult,
  stages: JobStatus[],
  deps: PipelineDeps,
  dryRun: boolean,
): Promise<void> {
  const locale = resolveLocale(scope, config);
  // Pretensão por nível (junior/pleno/senior) + teto da faixa salarial da vaga.
  locale.salaryExpectation = resolveSalaryExpectation(
    { jobTitle: title, jobText: markdown, currency: locale.currency },
    config,
  ).value;
  const jobId = title || raw.url;

  if (config.email.enabled) {
    const emailsSentToday = await deps.repo.countEmailsSentToday();
    if (emailsSentToday >= config.email.maxDailyEmails) {
      stages.push('DEFERRED');
      Object.assign(app, { status: 'DEFERRED', reason: 'DAILY_EMAIL_LIMIT' });
      return;
    }

    const emailResult = await applyViaEmail(
      {
        jobId,
        descriptionMarkdown: markdown,
        job: { title, company },
        profile,
        skills,
        resumePath,
        baseResumePath: resolveHome('storage/master_resume.pdf'),
        locale,
        fitScore,
        dryRun,
      },
      {
        repo: deps.repo,
        transport: deps.emailTransport,
        vault: deps.vault,
        config: config.email,
      },
    );

    if (emailResult.reason !== 'NO_CHANNEL') {
      stages.push(emailResult.status);
      Object.assign(app, { status: emailResult.status });
      return;
    }
    // NO_CHANNEL → tenta WhatsApp antes de escalar ao humano
  }

  if (config.whatsapp.enabled) {
    const waResult = await applyViaWhatsapp(
      {
        jobId,
        descriptionMarkdown: markdown,
        job: { title, company },
        profile,
        skills,
        resumePath,
        baseResumePath: resolveHome('storage/master_resume.pdf'),
        locale,
        dryRun,
      },
      {
        repo: deps.repo,
        transport: deps.evolutionTransport,
        config: config.whatsapp,
      },
    );

    if (waResult.reason !== 'NO_CHANNEL') {
      stages.push(waResult.status);
      Object.assign(app, { status: waResult.status, reason: waResult.reason });
      return;
    }
  }

  stages.push('NEEDS_HUMAN_INPUT');
  Object.assign(app, { status: 'NEEDS_HUMAN_INPUT', reason: 'NO_CHANNEL' });
}
