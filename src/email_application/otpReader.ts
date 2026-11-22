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
  unreadSince(since: Date, senderHint?: string, unseenOnly?: boolean): Promise<OtpMessage[]>;
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
export function parseImapCredential(
  json: string,
  opts: { honorHost?: boolean } = {},
): ImapCredential | null {
  try {
    const c = JSON.parse(json) as Record<string, unknown>;
    const user = String(c.user ?? c.email ?? c.username ?? '');
    const pass = String(c.pass ?? c.password ?? '');
    if (!user || !pass) return null;
    // `host` do JSON só vale p/ refs imap-* — e ainda assim um host `smtp.*`
    // é claramente erro de digitação (SMTP ≠ IMAP): ignora e deriva do e-mail.
    const rawHost = opts.honorHost !== false && c.host ? String(c.host) : null;
    const explicit = rawHost && !/^smtp\./i.test(rawHost) ? rawHost : null;
    const derived = imapHostFor(user);
    const host = explicit ?? derived?.host;
    if (!host) return null;
    // porta/secure do JSON só valem com host explícito; derivado → 993/TLS.
    const secure = explicit ? c.secure !== false : (derived?.secure ?? true);
    const port = explicit ? Number(c.port) || 993 : (derived?.port ?? 993);
    return { host, port, secure, user, pass };
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

/** Cliente real via imapflow — INBOX + Spam (magic links caem no lixo com
 * frequência; a pasta é localizada pelo specialUse `\\Junk`, à prova de
 * localização de conta). */
export function imapMailbox(cred: ImapCredential): OtpMailbox {
  const client = new ImapFlow({
    host: cred.host,
    port: cred.port,
    secure: cred.secure,
    auth: { user: cred.user, pass: cred.pass },
    logger: false,
    socketTimeout: 15_000, // host errado (ex.: smtp.*) não pode segurar o run
  });
  let junkPath: string | null = null;
  const searchIn = async (
    path: string,
    since: Date,
    senderHint: string | undefined,
    unseenOnly: boolean,
  ): Promise<OtpMessage[]> => {
    const lock = await client.getMailboxLock(path);
    try {
      const query: Record<string, unknown> = { since };
      if (unseenOnly) query.seen = false;
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
  };
  return {
    connect: async () => {
      await client.connect();
      try {
        const boxes = await client.list();
        const junk = boxes.find((b) => b.specialUse === '\\Junk');
        junkPath = junk?.path ?? null;
      } catch {
        junkPath = null; // lista falhou → só INBOX
      }
    },
    disconnect: async () => {
      try {
        await client.logout();
      } catch {
        // já desconectado
      }
    },
    unreadSince: async (since, senderHint, unseenOnly = true) => {
      const inbox = await searchIn('INBOX', since, senderHint, unseenOnly);
      if (!junkPath) return inbox;
      const junk = await searchIn(junkPath, since, senderHint, unseenOnly).catch(() => []);
      return [...inbox, ...junk];
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
  /** Feedback a cada poll — CLI usa p/ mostrar que a espera está ativa. */
  onTick?: (elapsedMs: number, timeoutMs: number) => void;
}): Promise<OtpFetchResult | null> {
  const { mailbox, since, senderHint, timeoutMs = 90_000, pollMs = 5000, onTick } = opts;
  const wait = opts.waitMs ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const started = Date.now();
  const deadline = started + timeoutMs;
  while (Date.now() < deadline) {
    await wait(pollMs);
    onTick?.(Date.now() - started, timeoutMs);
    try {
      // Progressão de tolerância: remetente exato+não-lido → lido também
      // (o usuário pode já ter aberto o e-mail noutro aparelho) → qualquer
      // remetente (o código pode vir por relay tipo sendgrid).
      let msgs = await mailbox.unreadSince(since, senderHint);
      if (msgs.length === 0 && senderHint)
        msgs = await mailbox.unreadSince(since, senderHint, false);
      if (msgs.length === 0 && senderHint) msgs = await mailbox.unreadSince(since);
      if (msgs.length === 0) msgs = await mailbox.unreadSince(since, undefined, false);
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
