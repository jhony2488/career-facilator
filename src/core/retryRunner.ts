import type { JobRepository, JobStatus, JobRecord } from '../db/repository';
import { matchFields, type InspectedField } from '../autofill/deterministicMatcher';
import { executeFill, type PageStateLike, type SubmitMode } from '../autofill/formExecutor';
import { closeLivePage, executeLiveFill } from '../autofill/playwrightExecutor';
import { detectBlockingSignal, escalate, type BlockingSignal } from './escalationHandler';
import type { PipelineDeps } from './pipeline';
import type { MasterProfileLike } from './types';

/**
 * Reteste de candidatura web (`retry`): reabre vagas NEEDS_HUMAN_INPUT e
 * re-executa só o estágio de formulário — sem discovery/triagem/tailoring.
 * Usa o `resumePath` persistido; `aiAnswers` = {} (campos obrigatórios sem
 * match escalam como UNKNOWN_REQUIRED_FIELD, igual ao pipeline).
 */

export interface RetryDeps {
  repo: Pick<JobRepository, 'updateStatus'>;
  pageFactory: (url: string) => Promise<PageStateLike>;
  onHumanEscalation?: PipelineDeps['onHumanEscalation'];
  humanPace?: boolean;
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
    // Se a cadena de candidatura revelou um mailto:, reporta-o p/ o humano.
    if (page.fields.length === 0) {
      const contact = page.contactEmail;
      return {
        status: 'NEEDS_HUMAN_INPUT',
        reason: contact ? `CONTACT_EMAIL:${contact}` : 'NO_WEB_FORM',
      };
    }

    const inspected: InspectedField[] = page.fields.map((f) => ({
      kind: f.kind as InspectedField['kind'],
      label: f.label,
      required: f.required,
    }));
    const { matched, unmatched } = matchFields(inspected, profile);
    const unmatchedRequired = unmatched.filter((f) => f.required);
    const fillInput = {
      matched,
      aiAnswers: {} as Record<string, string>,
      resumePath: job.resumePath ?? undefined,
      submitMode,
      humanPace: deps.humanPace,
    };
    const fill = await (page.dom ? executeLiveFill(page, fillInput) : executeFill(page, fillInput));

    // Bloqueio detectado na página ou campo desconhecido → mesma malha do run.
    const signal = detectBlockingSignal(page, {
      unmatchedRequiredLabels: unmatchedRequired.map((f) => f.label),
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
          effSignal.kind === 'LOGIN_REQUIRED') &&
        deps.onHumanEscalation
      ) {
        keepPageOpen = await deps
          .onHumanEscalation({
            page,
            signal: effSignal,
            jobUrl: job.url,
            matched,
            aiAnswers: {},
            resumePath: job.resumePath ?? undefined,
          })
          .catch(() => false);
      }
      await deps.repo.updateStatus(job.url, 'NEEDS_HUMAN_INPUT');
      return { status: 'NEEDS_HUMAN_INPUT', reason: effSignal.kind };
    }

    if (fill.status === 'READY_TO_REVIEW') {
      await deps.repo.updateStatus(job.url, 'READY_TO_REVIEW');
      return { status: 'READY_TO_REVIEW' };
    }
    await deps.repo.updateStatus(job.url, 'APPLIED');
    return { status: 'APPLIED' };
  } catch (e) {
    await deps.repo.updateStatus(job.url, 'FAILED').catch(() => {});
    return {
      status: 'FAILED',
      reason: e instanceof Error ? e.message.slice(0, 200) : String(e),
    };
  } finally {
    if (page && !keepPageOpen) await closeLivePage(page).catch(() => {});
  }
}
