import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { JobStatus } from '../db/repository';
import type { CareerOpsConfig } from '../config/careerOps.config';
import { resolveWhatsappRecipient } from './whatsappResolver';
import { composeWhatsapp, type WhatsappComposeInput, type WhatsappMessage } from './whatsappComposer';
import type { EvolutionTransport } from './evolutionClient';

export interface WhatsappApplyDeps {
  repo: {
    hasWhatsappSentTo(number: string, cooldownDays: number): Promise<boolean>;
    recordWhatsappApplication(input: {
      jobId: string;
      recipient: string;
      sent: boolean;
      subject?: string;
      attachmentPath?: string;
    }): Promise<void>;
  };
  /** Obrigatório apenas no modo EVOLUTION_API. */
  transport?: EvolutionTransport;
  config: CareerOpsConfig['whatsapp'];
}

export interface WhatsappApplyInput extends Omit<WhatsappComposeInput, 'recipient'> {
  jobId: string;
  descriptionMarkdown: string;
  dryRun?: boolean;
}

export interface WhatsappApplyResult {
  sent: boolean;
  status: JobStatus;
  reason?: string;
  /** Mensagem pronta — exibida na fila manual (review). */
  message?: WhatsappMessage;
  attempts?: number;
}

const TRANSIENT = /econn|timeout|temporar|429|50[0-9]/i;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Orquestrador da candidatura por WhatsApp (doc 15): resolve número →
 * compõe texto (+PDF) → fila manual ou envio via Evolution API → registra.
 */
export async function applyViaWhatsapp(
  input: WhatsappApplyInput,
  deps: WhatsappApplyDeps,
): Promise<WhatsappApplyResult> {
  const recipient = await resolveWhatsappRecipient(
    { descriptionMarkdown: input.descriptionMarkdown },
    { repo: deps.repo, cooldownDays: deps.config.recipientCooldownDays },
  );
  if (!recipient) {
    return { sent: false, status: 'NEEDS_HUMAN_INPUT', reason: 'NO_CHANNEL' };
  }

  const message = await composeWhatsapp({
    ...input,
    recipient,
    bodyTemplatePath: deps.config.bodyTemplatePath,
    attachResume: deps.config.attachResume,
  });

  if (input.dryRun) {
    return { sent: false, status: 'DRY_RUN', message };
  }

  if (deps.config.mode === 'MANUAL_QUEUE' || !deps.transport) {
    await deps.repo.recordWhatsappApplication({
      jobId: input.jobId,
      recipient: message.number,
      sent: false,
      subject: message.text,
      attachmentPath: message.resumePath,
    });
    return { sent: false, status: 'NEEDS_HUMAN_INPUT', reason: 'WHATSAPP_MANUAL', message };
  }

  const maxRetries = deps.config.maxRetries ?? 3;
  const backoffMs = deps.config.retryBackoffMs ?? 60_000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await deps.transport.sendText(message.number, message.text);
      if (message.resumePath) {
        const pdf = await readFile(message.resumePath);
        await deps.transport.sendDocument(
          message.number,
          pdf.toString('base64'),
          basename(message.resumePath),
          input.job.title,
        );
      }
      await deps.repo.recordWhatsappApplication({
        jobId: input.jobId,
        recipient: message.number,
        sent: true,
        subject: message.text,
        attachmentPath: message.resumePath,
      });
      return { sent: true, status: 'APPLIED_VIA_WHATSAPP', message, attempts: attempt };
    } catch (err) {
      const transient = err instanceof Error && TRANSIENT.test(err.message);
      if (!transient) {
        return { sent: false, status: 'FAILED', message, attempts: attempt };
      }
      if (attempt < maxRetries) await sleep(backoffMs);
    }
  }

  return { sent: false, status: 'NEEDS_HUMAN_INPUT', message, attempts: maxRetries };
}
