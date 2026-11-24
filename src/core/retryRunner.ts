import type { JobRepository, JobStatus, JobRecord } from '../db/repository';
import { matchFields, type InspectedField } from '../autofill/deterministicMatcher';
import {
  executeFill,
  type PageStateLike,
  type SubmitMode,
  type UnresolvedQuestion,
} from '../autofill/formExecutor';
import { readAnswers, writeAnswers } from '../autofill/answersStore';
import { resolveHome } from '../config/paths';
import { existsSync } from 'node:fs';
import { closeLivePage, executeLiveFill } from '../autofill/playwrightExecutor';
import { detectBlockingSignal, escalate, type BlockingSignal } from './escalationHandler';
import {
  buildProfileContext,
  chunkProfile,
  retrieveRelevant,
} from '../ai/rag/profileRetriever';
import type { PipelineDeps } from './pipeline';
import type { MasterProfileLike } from './types';

/**
 * Reteste de candidatura web (`retry`): reabre vagas NEEDS_HUMAN_INPUT e
 * re-executa só o estágio de formulário — sem discovery/triagem/tailoring.
 * Usa o `resumePath` persistido + respostas do tailor (`<resume>.answers.json`)
 * — campos obrigatórios sem match/answer escalam como UNKNOWN_REQUIRED_FIELD.
 */

export interface RetryDeps {
  repo: Pick<JobRepository, 'updateStatus'>;
  pageFactory: (url: string) => Promise<PageStateLike>;
  onHumanEscalation?: PipelineDeps['onHumanEscalation'];
  humanPace?: boolean;
  /** `AUTOFILL_DEBUG_FILL` — loga campo→valor→fonte no fill web. */
  debugFill?: boolean;
  /** Defaults configuráveis para campos obrigatórios não reconhecidos. */
  fieldDefaults?: Record<string, string>;
  /** Limiar de similaridade das respostas do tailor (0..1). */
  fuzzyThreshold?: number;
  /** LLM ao vivo p/ campos sem resposta (decisão #39 — revisita #27). */
  answerQuestions?: PipelineDeps['answerQuestions'];
}

export interface RetryResult {
  status: JobStatus;
  reason?: string;
}

export async function reapplyStoredJob(
  job: JobRecord,
  ctx: { profile: MasterProfileLike; deps: RetryDeps; submitMode?: SubmitMode },
): Promise<RetryResult> {
  const { profile, deps } = ctx;
  const submitMode: SubmitMode = ctx.submitMode ?? 'PAUSE_BEFORE_SUBMIT';
  let page: PageStateLike | undefined;
  let keepPageOpen = false;
  try {
    page = await deps.pageFactory(job.url);
    // Plataforma já sinaliza candidatura enviada — resolve sem gastar fill.
    if (page.alreadyAppliedBanner) {
      await deps.repo.updateStatus(job.url, 'APPLIED');
      return { status: 'APPLIED', reason: 'ALREADY_APPLIED_BANNER' };
    }
    // Página sem form web (canal e-mail/WhatsApp) — fica p/ review/manual.
    // Dropzone de CV conta como form (o fill anexa mesmo sem outros campos).
    // Se a cadena de candidatura revelou um mailto:, reporta-o p/ o humano.
    if (page.fields.length === 0 && !page.dropzones?.length) {
      const contact = page.contactEmail;
      // Atualiza o contexto da pendência — o review mostra o canal encontrado.
      await deps.repo
        .updateStatus(job.url, 'NEEDS_HUMAN_INPUT', undefined, {
          reason: contact ? 'CONTACT_EMAIL' : 'NO_WEB_FORM',
          url: page.url !== job.url ? page.url : undefined,
          detail: contact ? `E-mail de contato: ${contact}` : undefined,
        })
        .catch(() => {});
      return {
        status: 'NEEDS_HUMAN_INPUT',
        reason: contact ? `CONTACT_EMAIL:${contact}` : 'NO_WEB_FORM',
      };
    }

    const inspected: InspectedField[] = page.fields.map((f) => ({
      kind: f.kind as InspectedField['kind'],
      label: f.label,
      required: f.required,
      name: f.name,
      selector: f.selector,
      options: f.options,
    }));
    const { matched, unmatched } = matchFields(inspected, profile, deps.fieldDefaults);
    // Respostas do tailor + live persistidas no run — preenchem os campos
    // que o match determinístico não cobre (antes caíam em UNKNOWN_…).
    const aiAnswers = readAnswers(job.resumePath);
    // Sem CV tailorado em registro antigo → master resume de fallback.
    // job.resumePath é relativo ao CAREER_HOME — resolve p/ path real.
    const masterResume = resolveHome('storage/master_resume.pdf');
    const resumePath = job.resumePath
      ? resolveHome(job.resumePath)
      : existsSync(masterResume)
        ? masterResume
        : undefined;
    // Resposta REQUIRED vinda só do modelo = baixa confiança — pausa em
    // vez de auto-submit (mesma anti-fabricação do pipeline, decisão #30).
    const lowConfidence = unmatched.some((f) => f.required && aiAnswers[f.label] !== undefined);
    const effectiveSubmit: SubmitMode =
      submitMode === 'AUTO_SUBMIT' && lowConfidence ? 'PAUSE_BEFORE_SUBMIT' : submitMode;
    // Respostas ao vivo também no retry (decisão #39): ctx da vaga vem do
    // registro persistido + perfil via RAG léxico (sem embedder no retry).
    const liveAnswerer = deps.answerQuestions
      ? (questions: UnresolvedQuestion[]) =>
          deps.answerQuestions!(questions, {
            jobTitle: job.title,
            company: job.company,
            jobExcerpt: job.descriptionMarkdown.slice(0, 2000),
            profileContext: buildProfileContext(
              retrieveRelevant(chunkProfile(profile), {
                keywords: [job.title],
                jobText: job.descriptionMarkdown,
              }),
            ),
          })
      : undefined;
    const fillInput = {
      matched,
      aiAnswers,
      fieldDefaults: deps.fieldDefaults,
      fuzzyThreshold: deps.fuzzyThreshold,
      resumePath,
      submitMode: effectiveSubmit,
      humanPace: deps.humanPace,
      debug: deps.debugFill,
      answerQuestions: liveAnswerer,
    };
    const fill = await (page.dom ? executeLiveFill(page, fillInput) : executeFill(page, fillInput));

    // Respostas geradas ao vivo entram no sidecar — próximos retries reutilizam.
    if (fill.liveAnswers && Object.keys(fill.liveAnswers).length && job.resumePath) {
      Object.assign(aiAnswers, fill.liveAnswers);
      writeAnswers(job.resumePath, aiAnswers);
    }

    // Bloqueio detectado na página ou campo desconhecido → mesma malha do run.
    const signal = detectBlockingSignal(page, {
      unmatchedRequiredLabels: fill.unansweredRequired ?? [],
    });
    if (signal || fill.escalated) {
      const effSignal: BlockingSignal = signal ?? {
        kind: 'UNKNOWN_REQUIRED_FIELD',
        detail: 'bloqueio no preenchimento',
      };
      await escalate(page, effSignal);
      if (
        (effSignal.kind === 'CAPTCHA' ||
          effSignal.kind === 'EMAIL_OTP' ||
          effSignal.kind === 'LOGIN_REQUIRED' ||
          (effSignal.kind === 'UNKNOWN_REQUIRED_FIELD' && !!page.dom)) &&
        deps.onHumanEscalation
      ) {
        keepPageOpen = await deps
          .onHumanEscalation({
            page,
            signal: effSignal,
            jobUrl: job.url,
            matched,
            aiAnswers,
            resumePath,
            unansweredLabels: fill.unansweredRequired,
          })
          .catch(() => false);
      }
      await deps.repo
        .updateStatus(job.url, 'NEEDS_HUMAN_INPUT', undefined, {
          reason: effSignal.kind,
          url: page.url !== job.url ? page.url : undefined,
          detail: fill.unansweredRequired?.length
            ? `Perguntas sem resposta: ${fill.unansweredRequired.join(' | ')}`
            : effSignal.detail,
        })
        .catch(() => {});
      return { status: 'NEEDS_HUMAN_INPUT', reason: effSignal.kind };
    }

    if (fill.status === 'READY_TO_REVIEW') {
      await deps.repo.updateStatus(job.url, 'READY_TO_REVIEW');
      return { status: 'READY_TO_REVIEW' };
    }
    await deps.repo.updateStatus(job.url, 'APPLIED');
    return { status: 'APPLIED' };
  } catch (e) {
    // Ctrl+C propaga como AbortError — cancela o retry, não marca FAILED.
    if (e instanceof Error && e.name === 'AbortError') throw e;
    await deps.repo
      .updateStatus(job.url, 'FAILED', undefined, {
        reason: e instanceof Error ? e.message.slice(0, 200) : String(e),
      })
      .catch(() => {});
    return {
      status: 'FAILED',
      reason: e instanceof Error ? e.message.slice(0, 200) : String(e),
    };
  } finally {
    if (page && !keepPageOpen) await closeLivePage(page).catch(() => {});
  }
}
