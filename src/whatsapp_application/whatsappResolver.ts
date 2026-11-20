export interface WhatsappRecipient {
  number: string; // somente dígitos, formato internacional (ex.: 5581999887766)
}

export interface WhatsappJobInput {
  descriptionMarkdown: string;
}

export interface WhatsappRepo {
  hasWhatsappSentTo(number: string, cooldownDays: number): Promise<boolean>;
}

export interface WhatsappResolverDeps {
  repo: WhatsappRepo;
  cooldownDays?: number;
}

/** Números de telefone: +DDI opcional, 8–15 dígitos totais, com separadores comuns. */
const PHONE_RE = /\+?\d[\d().\-\s]{6,18}\d/g;
const WA_LINK_RE = /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)\+?(\d{8,15})/gi;
const WHATSAPP_CONTEXT_RE = /whats(app)?|zap|telefone|celular|phone|contato|apply via|envie seu/i;

function normalize(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Extrai o número de WhatsApp para candidatura (doc 15): prioriza links
 * wa.me/api.whatsapp.com, depois linhas com contexto de WhatsApp/contato.
 * Bloqueia reenvio dentro do cooldown por número — anti-duplicidade.
 */
export async function resolveWhatsappRecipient(
  job: WhatsappJobInput,
  deps: WhatsappResolverDeps,
): Promise<WhatsappRecipient | null> {
  const md = job.descriptionMarkdown;
  const candidates: string[] = [];

  for (const m of md.matchAll(WA_LINK_RE)) {
    const digits = m[1];
    if (digits.length >= 8 && digits.length <= 15 && !candidates.includes(digits)) {
      candidates.push(digits);
    }
  }

  for (const line of md.split('\n')) {
    if (!WHATSAPP_CONTEXT_RE.test(line)) continue;
    for (const raw of line.match(PHONE_RE) ?? []) {
      const digits = normalize(raw);
      if (digits.length >= 8 && digits.length <= 15 && !candidates.includes(digits)) {
        candidates.push(digits);
      }
    }
  }

  if (candidates.length === 0) return null;

  const cooldownDays = deps.cooldownDays ?? 30;
  for (const number of candidates) {
    const alreadySent = await deps.repo.hasWhatsappSentTo(number, cooldownDays);
    if (!alreadySent) return { number };
  }

  return null; // todos em cooldown → anti-duplicidade
}
