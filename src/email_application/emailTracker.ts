import type { EmailDraft } from './emailComposer';

export interface EmailTrackingRepo {
  recordEmailApplication(input: {
    jobId: string;
    recipient: string;
    subject: string;
    attachmentPath?: string;
  }): Promise<void>;
}

/**
 * Rastreador de envio e retorno (doc 11 §3.4): registra destinatário,
 * assunto, anexo e timestamp no banco local com status APPLIED_VIA_EMAIL.
 */
export async function trackSentEmail(
  repo: EmailTrackingRepo,
  jobId: string,
  draft: EmailDraft,
): Promise<void> {
  await repo.recordEmailApplication({
    jobId,
    recipient: draft.to,
    subject: draft.subject,
    attachmentPath: draft.attachments[0],
  });
}
