import type { JobStatus } from '../db/repository';
import type { EmailDraft } from './emailComposer';

export type EmailDispatchMode = 'REQUIRE_REVIEW' | 'HYBRID_BY_SCORE' | 'AUTO_SEND_HIGH_FIT';

export interface SmtpTransport {
  sendMail(message: {
    to: string;
    subject: string;
    text: string;
    attachments: string[];
  }): Promise<{ messageId: string }>;
}

export interface CredentialVault {
  getCredential(ref: string): Promise<string>;
}

export interface EmailDispatchConfig {
  dispatchMode: EmailDispatchMode;
  smtpCredentialRef: string;
  minScoreAutoSend?: number;
  /** Máx. tentativas em falha transitória (default 3 — DECISOES feature/10). */
  maxRetries?: number;
  retryBackoffMs?: number;
}

export interface DispatchDeps {
  transport: SmtpTransport;
  vault: CredentialVault;
  config: EmailDispatchConfig;
}

export interface DispatchResult {
  sent: boolean;
  status?: JobStatus;
  messageId?: string;
  /** Total de tentativas feitas (1 = primeiro envio, sem retry). */
  attempts?: number;
}

const TRANSIENT_ERROR = /reset|timeout|econn|eai_again|421|450|451|452|temporar/i;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Disparo de candidatura por e-mail (doc 11): credenciais só via cofre,
 * revisão conforme dispatchMode, retry em falha transitória — esgotadas as
 * tentativas → NEEDS_HUMAN_INPUT (DECISOES feature/10).
 */
export async function dispatchEmail(
  draft: EmailDraft,
  deps: DispatchDeps,
): Promise<DispatchResult> {
  const { transport, vault, config } = deps;
  const maxRetries = config.maxRetries ?? 3;
  const backoffMs = config.retryBackoffMs ?? 60_000;

  const needsReview =
    config.dispatchMode === 'REQUIRE_REVIEW' ||
    (config.dispatchMode === 'HYBRID_BY_SCORE' &&
      draft.fitScore !== undefined &&
      draft.fitScore < (config.minScoreAutoSend ?? 88));
  if (needsReview) {
    return { sent: false, status: 'READY_TO_REVIEW' };
  }

  // Credencial obtida exclusivamente do cofre criptografado — nunca de config/logs
  const credential = await vault.getCredential(config.smtpCredentialRef);
  void credential; // usada pelo transport real (SMTP auth)

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { messageId } = await transport.sendMail({
        to: draft.to,
        subject: draft.subject,
        text: draft.body,
        attachments: draft.attachments,
      });
      return { sent: true, status: 'APPLIED_VIA_EMAIL', messageId, attempts: attempt };
    } catch (err) {
      const transient = err instanceof Error && TRANSIENT_ERROR.test(err.message);
      if (!transient) return { sent: false, status: 'FAILED', attempts: attempt };
      if (attempt < maxRetries) await sleep(backoffMs);
    }
  }

  // Retry esgotado em falha transitória → escala para o humano (DECISOES).
  return { sent: false, status: 'NEEDS_HUMAN_INPUT', attempts: maxRetries };
}
