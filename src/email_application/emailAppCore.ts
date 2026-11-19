import { resolveRecipient } from './recipientResolver';
import { composeEmail, type ComposeInput } from './emailComposer';
import { dispatchEmail, type DispatchDeps, type DispatchResult } from './emailDispatcher';
import { trackSentEmail } from './emailTracker';
import type { JobRepository } from '../db/repository';

export interface EmailApplicationDeps extends Omit<DispatchDeps, 'config'> {
  repo: JobRepository;
  config: DispatchDeps['config'];
}

/**
 * Orquestrador do fluxo de candidatura por e-mail (doc e-mail §6):
 * resolve destinatário → compõe mensagem → revisa/dispara → registra.
 */
export async function applyViaEmail(
  input: Omit<ComposeInput, 'recipient'> & { jobId: string },
  deps: EmailApplicationDeps,
): Promise<DispatchResult> {
  const recipient = await resolveRecipient(
    {
      descriptionMarkdown:
        (input.job as { descriptionMarkdown?: string }).descriptionMarkdown ?? '',
    },
    { repo: deps.repo, cooldownDays: 30 },
  );
  if (!recipient) {
    return { sent: false, status: 'NEEDS_HUMAN_INPUT' };
  }

  const draft = await composeEmail({ ...input, recipient });
  const result = await dispatchEmail(draft, deps);

  if (result.sent) {
    await trackSentEmail(deps.repo, input.jobId, draft);
  }
  return result;
}
