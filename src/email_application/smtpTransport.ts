import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createTransport, type Transporter } from 'nodemailer';
import type { SmtpTransport, CredentialVault } from './emailDispatcher';

/** Segredo SMTP armazenado no cofre (JSON). Nunca vai para config/log. */
export interface SmtpCredential {
  host: string;
  port: number;
  /** true → TLS direto (porta 465); false → STARTTLS (porta 587). */
  secure: boolean;
  user: string;
  pass: string;
}

/**
 * Credencial SMTP via env (SMTP_HOST/PORT/SECURE/USER/PASS) — alternativa ao
 * cofre p/ uso local; texto claro no .env, não usar em ambiente compartilhado.
 * Retorna null quando SMTP_USER ou SMTP_PASS não estão definidos.
 */
export function smtpCredentialFromEnv(
  env: Record<string, string | undefined>,
): SmtpCredential | null {
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  if (!user || !pass) return null;
  const secure =
    env.SMTP_SECURE === 'true' || env.SMTP_SECURE === '1' || env.SMTP_PORT === '465';
  return {
    host: env.SMTP_HOST?.trim() || 'smtp.gmail.com',
    port: Number(env.SMTP_PORT) || (secure ? 465 : 587),
    secure,
    user,
    pass,
  };
}

export interface SmtpTransportDeps {
  vault: CredentialVault;
  /** Ref do segredo no cofre (ex.: 'smtp-main'). */
  ref: string;
  /** Injetável p/ testes — real usa nodemailer.createTransport. */
  transportFactory?: (cred: SmtpCredential) => Transporter;
}

/**
 * Transporte SMTP real (doc 11): busca a credencial no cofre a cada envio —
 * nenhuma senha passa por config, env de texto claro ou log.
 */
export function createSmtpTransport(deps: SmtpTransportDeps): SmtpTransport {
  const factory = deps.transportFactory ?? ((cred: SmtpCredential) =>
    createTransport({
      host: cred.host,
      port: cred.port,
      secure: cred.secure,
      auth: { user: cred.user, pass: cred.pass },
    }));

  return {
    async sendMail(message) {
      const raw = await deps.vault.getCredential(deps.ref);
      const cred = JSON.parse(raw) as SmtpCredential;
      const transporter = factory(cred);
      const { messageId } = await transporter.sendMail({
        from: cred.user,
        to: message.to,
        subject: message.subject,
        text: message.text,
        attachments: await Promise.all(
          message.attachments.map(async (path) => ({
            filename: basename(path),
            content: await readFile(path),
          })),
        ),
      });
      return { messageId: messageId ?? '' };
    },
  };
}
