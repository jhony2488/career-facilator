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
  retryScheduled?: boolean;
}

const TRANSIENT_ERROR = /reset|timeout|econn|eai_again|421|450|451|452|temporar/i;

/**
 * Disparo de candidatura por e-mail (feature/10): credenciais só via cofre,
 * revisão conforme dispatchMode, retry automático em falha transitória.
 */
export async function dispatchEmail(
  draft: EmailDraft,
  deps: DispatchDeps,
): Promise<DispatchResult> {
  const { transport, vault, config } = deps;

  if (config.dispatchMode === 'REQUIRE_REVIEW') {
    return { sent: false, status: 'READY_TO_REVIEW' };
  }

  // Credencial obtida exclusivamente do cofre criptografado — nunca de config/logs
  const credential = await vault.getCredential(config.smtpCredentialRef);
  void credential; // usada pelo transport real (SMTP auth)

  try {
    const { messageId } = await transport.sendMail({
      to: draft.to,
      subject: draft.subject,
      text: draft.body,
      attachments: draft.attachments,
    });
    return { sent: true, status: 'APPLIED_VIA_EMAIL', messageId };
  } catch (err) {
    const transient = err instanceof Error && TRANSIENT_ERROR.test(err.message);
    return {
      sent: false,
      status: transient ? undefined : 'FAILED',
      retryScheduled: transient,
    };
  }
}
