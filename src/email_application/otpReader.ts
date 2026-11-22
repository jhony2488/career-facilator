import { ImapFlow } from 'imapflow';

/**
 * Leitor de OTP por e-mail (doc 10): quando o portal pede código de
 * verificação (EMAIL_OTP), busca a mensagem mais recente do remetente na
 * caixa IMAP e extrai o código — ou link de confirmação — para digitar na
 * página. Credencial: `vault set imap-main` ({host,port,secure,user,pass})
 * ou reaproveita `smtp-main` {user,pass} quando o host IMAP é derivável
 * do domínio do e-mail (gmail.com → imap.gmail.com…).
 */

export interface OtpMessage {
  from: string;
  subject: string;
  text: string;
}

/** Cliente IMAP mínimo — real via imapflow; mockável nos testes. */
export interface OtpMailbox {
  connect(): Promise<void>;
  /** Mensagens não-lidas recebidas após `since`, mais novas primeiro. */
  unreadSince(since: Date, senderHint?: string): Promise<OtpMessage[]>;
  disconnect(): Promise<void>;
}

export interface ImapCredential {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

const IMAP_HOSTS: Record<string, string> = {
  'gmail.com': 'imap.gmail.com',
  'googlemail.com': 'imap.gmail.com',
  'outlook.com': 'outlook.office365.com',
  'hotmail.com': 'outlook.office365.com',
  'live.com': 'outlook.office365.com',
  'yahoo.com': 'imap.mail.yahoo.com',
};

/** `dev@gmail.com` → imap.gmail.com:993. Domínio desconhecido → null (exige host explícito). */
export function imapHostFor(
  email: string,
): Pick<ImapCredential, 'host' | 'port' | 'secure'> | null {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  const host = IMAP_HOSTS[domain];
  return host ? { host, port: 993, secure: true } : null;
}

/** Credencial `imap-main` ({host…}) ou `smtp-main` ({user,pass} + host derivado). */
export function parseImapCredential(json: string): ImapCredential | null {
  try {
    const c = JSON.parse(json) as Record<string, unknown>;
    const user = String(c.user ?? c.email ?? c.username ?? '');
    const pass = String(c.pass ?? c.password ?? '');
    if (!user || !pass) return null;
    const explicit = c.host ? String(c.host) : null;
    const derived = imapHostFor(user);
    const host = explicit ?? derived?.host;
    if (!host) return null;
    const secure = c.secure !== false;
    return { host, port: Number(c.port) || 993, secure, user, pass };
  } catch {
    return null;
  }
}

/**
 * Código 4–8 dígitos — prioriza o que está perto de palavra-chave de
 * verificação (a Gupy/LinkedIn mandam "Seu código: 123456").
 */
const CODE_HINT_RE =
  /(?:c[óo]digo|code|verification|verifica[çc][aã]o|otp|pin|token)[^0-9]{0,40}(\d{4,8})/i;
const ANY_CODE_RE = /\b(\d{6,8})\b/;

export function extractOtpCode(text: string): string | null {
  const hinted = CODE_HINT_RE.exec(text);
  if (hinted) return hinted[1];
  const any = ANY_CODE_RE.exec(text);
  return any ? any[1] : null;
}

/** Link de confirmação/magic-login no e-mail (verify/confirm/token/magic/otp no path). */
export function extractOtpLink(text: string): string | null {
  for (const raw of text.match(/https?:\/\/[^\s<>"')]+/gi) ?? []) {
    const url = raw.replace(/[.,;!\]]+$/, '');
    if (/verify|confirm|token|magic|otp|signin|sign-in|auth/i.test(url)) return url;
  }
  return null;
}

/** Cliente real via imapflow — INBOX, não-lidas desde `since`, filtro opcional de remetente. */
export function imapMailbox(cred: ImapCredential): OtpMailbox {
  const client = new ImapFlow({
    host: cred.host,
    port: cred.port,
    secure: cred.secure,
    auth: { user: cred.user, pass: cred.pass },
    logger: false,
  });
  return {
    connect: () => client.connect(),
    disconnect: async () => {
      try {
        await client.logout();
      } catch {
        // já desconectado
      }
    },
    unreadSince: async (since, senderHint) => {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const query: Record<string, unknown> = { seen: false, since };
        if (senderHint) query.from = senderHint;
        const found = await client.search(query, { uid: true });
        const uids = Array.isArray(found) ? found : [];
        const msgs: OtpMessage[] = [];
        for (const uid of uids.slice(-5).reverse()) {
          const m = await client.fetchOne(
            String(uid),
            { envelope: true, bodyParts: ['text'] },
            { uid: true },
          );
          if (!m) continue;
          const text = m.bodyParts?.get('text')?.toString('utf8') ?? '';
          msgs.push({
            from: m.envelope?.from?.[0]?.address ?? '',
            subject: m.envelope?.subject ?? '',
            text,
          });
        }
        return msgs;
      } finally {
        lock.release();
      }
    },
  };
}

export interface OtpFetchResult {
  code?: string;
  link?: string;
  from?: string;
}

/**
 * Poll da caixa até achar código/link do remetente do portal — janela de
 * `timeoutMs` (default 90s), poll a cada 5s. `since` = quando a página
 * pediu o OTP; só mensagens posteriores contam.
 */
export async function fetchOtp(opts: {
  mailbox: OtpMailbox;
  since: Date;
  senderHint?: string;
  timeoutMs?: number;
  pollMs?: number;
  waitMs?: (ms: number) => Promise<void>;
}): Promise<OtpFetchResult | null> {
  const { mailbox, since, senderHint, timeoutMs = 90_000, pollMs = 5000 } = opts;
  const wait = opts.waitMs ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await wait(pollMs);
    try {
      const msgs = await mailbox.unreadSince(since, senderHint);
      for (const m of msgs) {
        const code = extractOtpCode(m.text);
        const link = extractOtpLink(m.text);
        if (code || link) return { code: code ?? undefined, link: link ?? undefined, from: m.from };
      }
    } catch {
      // caixa indisponível — tenta de novo no próximo poll
    }
  }
  return null;
}
