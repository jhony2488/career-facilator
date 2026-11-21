import type { JobStatus } from '../db/repository';
import type { PageStateLike } from '../autofill/formExecutor';

export type BlockingSignalKind =
  'CAPTCHA' | 'EMAIL_OTP' | 'LOGIN_REQUIRED' | 'UNKNOWN_REQUIRED_FIELD' | 'SESSION_EXPIRED';

export interface BlockingSignal {
  kind: BlockingSignalKind;
  detail: string;
}

export interface DetectionContext {
  unmatchedRequiredLabels?: string[];
  sessionState?: object | null;
}

export interface EscalationOutcome {
  status: 'NEEDS_HUMAN_INPUT';
  signal: BlockingSignal;
  progressPreserved: boolean;
  savedPageState: PageStateLike;
}

export interface ResumeOutcome {
  continueFromStep: number;
  status: JobStatus;
}

/**
 * Detector de bloqueios (doc 10, feature/09): o robô nunca falha nem inventa
 * dados — CAPTCHA, OTP, campo desconhecido ou sessão expirada → escala.
 */
export function detectBlockingSignal(
  page: PageStateLike,
  ctx: DetectionContext = {},
): BlockingSignal | null {
  if (page.hasCaptcha) {
    return { kind: 'CAPTCHA', detail: 'Desafio anti-robô detectado na página' };
  }
  if (page.requiresEmailOtp) {
    return { kind: 'EMAIL_OTP', detail: 'Verificação de código por e-mail exigida' };
  }
  if (page.requiresLogin) {
    return { kind: 'LOGIN_REQUIRED', detail: 'Portal exige login para prosseguir' };
  }
  if (ctx.sessionState === null) {
    return { kind: 'SESSION_EXPIRED', detail: 'Sessão autenticada expirada ou inválida' };
  }
  if (ctx.unmatchedRequiredLabels && ctx.unmatchedRequiredLabels.length > 0) {
    return {
      kind: 'UNKNOWN_REQUIRED_FIELD',
      detail: `Campo obrigatório sem mapeamento: ${ctx.unmatchedRequiredLabels.join(', ')}`,
    };
  }
  return null;
}

/** Escala preservando progresso — campos preenchidos e estado da sessão. */
export async function escalate(
  page: PageStateLike,
  signal: BlockingSignal,
): Promise<EscalationOutcome> {
  return {
    status: 'NEEDS_HUMAN_INPUT',
    signal,
    progressPreserved: true,
    savedPageState: { ...page, fields: page.fields.map((f) => ({ ...f })) },
  };
}

/** Retoma o fluxo do ponto de parada após resolução humana do bloqueio. */
export async function resumeAfterEscalation(
  savedPageState: PageStateLike,
  opts: { humanResolved: boolean },
): Promise<ResumeOutcome> {
  if (!opts.humanResolved) {
    return { continueFromStep: savedPageState.currentStep, status: 'NEEDS_HUMAN_INPUT' };
  }
  return { continueFromStep: savedPageState.currentStep, status: 'READY_TO_REVIEW' };
}
