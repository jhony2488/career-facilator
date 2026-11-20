import type { JobStatus } from '../db/repository';
import type { CareerOpsConfig } from '../config/careerOps.config';
import type { LocaleDecision } from '../geo/localeAdapter';
import type { SkillMetadata } from '../skills/core/skillRegistry';
import { resolveRecipient } from './recipientResolver';
import { composeEmail, type ComposeProfile } from './emailComposer';
import {
  dispatchEmail,
  type CredentialVault,
  type SmtpTransport,
} from './emailDispatcher';
import { trackSentEmail } from './emailTracker';

export interface EmailApplyInput {
  jobId: string;
  descriptionMarkdown: string;
  job: { title: string; company: string };
  profile: ComposeProfile;
  skills: SkillMetadata[];
  resumePath?: string;
  baseResumePath?: string;
  locale: LocaleDecision;
  fitScore?: number;
  dryRun?: boolean;
}

export interface EmailApplyDeps {
  repo: {
    hasEmailSentTo(email: string, cooldownDays: number): Promise<boolean>;
    recordEmailApplication(input: {
      jobId: string;
      recipient: string;
      subject: string;
      attachmentPath?: string;
    }): Promise<void>;
  };
  /** Sem transport/cofre o envio é impossível → NEEDS_HUMAN_INPUT. */
  transport?: SmtpTransport;
  vault?: CredentialVault;
  config: CareerOpsConfig['email'];
}

export interface EmailApplyResult {
  sent: boolean;
  status: JobStatus;
  reason?: string;
  attempts?: number;
}

/**
 * Orquestrador do fluxo de candidatura por e-mail (doc 11): resolve
 * destinatário (cooldown) → compõe via template → revisa/dispara → registra.
 * `trackSentEmail` alimenta o cooldown por destinatário e o teto diário.
 */
export async function applyViaEmail(
  input: EmailApplyInput,
  deps: EmailApplyDeps,
): Promise<EmailApplyResult> {
  const recipient = await resolveRecipient(
    { descriptionMarkdown: input.descriptionMarkdown },
    { repo: deps.repo, cooldownDays: deps.config.recipientCooldownDays },
  );
  if (!recipient) {
    return { sent: false, status: 'NEEDS_HUMAN_INPUT', reason: 'NO_CHANNEL' };
  }

  const draft = await composeEmail({
    job: input.job,
    recipient,
    profile: input.profile,
    skills: input.skills,
    resumePath: input.resumePath,
    baseResumePath: input.baseResumePath,
    locale: input.locale,
    fitScore: input.fitScore,
    bodyTemplatePath: deps.config.bodyTemplatePath,
    includeSalaryExpectation: deps.config.includeSalaryExpectation,
  });

  if (input.dryRun) {
    return { sent: false, status: 'DRY_RUN' };
  }

  if (!deps.transport || !deps.vault) {
    return { sent: false, status: 'NEEDS_HUMAN_INPUT', reason: 'NO_CHANNEL' };
  }

  const result = await dispatchEmail(draft, {
    transport: deps.transport,
    vault: deps.vault,
    config: {
      dispatchMode: deps.config.dispatchMode,
      smtpCredentialRef: deps.config.smtpCredentialRef,
      minScoreAutoSend: deps.config.minScoreAutoSend,
      maxRetries: deps.config.maxRetries,
      retryBackoffMs: deps.config.retryBackoffMs,
    },
  });

  if (result.sent) {
    await trackSentEmail(deps.repo, input.jobId, draft);
  }

  return { sent: result.sent, status: result.status ?? 'FAILED', attempts: result.attempts };
}
