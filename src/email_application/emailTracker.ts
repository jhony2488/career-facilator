import type { JobRepository } from '../db/repository';
import type { EmailDraft } from './emailComposer';

/**
 * Rastreador de envio e retorno (doc e-mail §3.4): registra destinatário,
 * assunto, anexo e timestamp no banco local com status APPLIED_VIA_EMAIL.
 */
export async function trackSentEmail(
  repo: JobRepository,
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
