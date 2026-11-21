/**
 * Extração de canais de contato de texto livre (posts do LinkedIn, descrição
 * de vaga, saída de OCR). Os padrões espelham os resolvers do pipeline —
 * `recipientResolver` (e-mail, match global) e `whatsappResolver` (wa.me +
 * telefone c/ contexto) — para que os contatos sintetizados no html do post
 * sejam reconhecidos pelos canais existentes.
 */

export interface PostContacts {
  emails: string[];
  phones: string[];
  /** Links externos de candidatura (forms, ATS, wa.me) — exclui linkedin.com. */
  links: string[];
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const WA_LINK_RE = /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)\+?(\d{8,15})/gi;
const PHONE_RE = /\+?\d[\d().\-\s]{6,18}\d/g;
const URL_RE = /https?:\/\/[^\s<>"')]+/g;
const LINKEDIN_HOST_RE = /^(www\.)?linkedin\.com$|lnkd\.in/i;

function digitsOf(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function isExternalLink(url: string): boolean {
  try {
    return !LINKEDIN_HOST_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function extractContacts(text: string): PostContacts {
  const emails = [...new Set(text.match(EMAIL_RE) ?? [])];

  const phones: string[] = [];
  const links: string[] = [];
  for (const m of text.matchAll(WA_LINK_RE)) {
    if (!phones.includes(m[1])) phones.push(m[1]);
    // wa.me sem scheme → normaliza p/ url completa (também é link de candidatura)
    const waUrl = `https://wa.me/${m[1]}`;
    if (!links.includes(waUrl)) links.push(waUrl);
  }
  for (const raw of text.match(PHONE_RE) ?? []) {
    const digits = digitsOf(raw);
    if (digits.length >= 8 && digits.length <= 15 && !phones.includes(digits)) {
      phones.push(digits);
    }
  }

  for (const raw of text.match(URL_RE) ?? []) {
    const url = raw.replace(/[.,;!]+$/, '');
    if (isExternalLink(url) && !links.includes(url)) links.push(url);
  }

  return { emails, phones, links };
}

export function hasAnyContact(c: PostContacts): boolean {
  return c.emails.length > 0 || c.phones.length > 0 || c.links.length > 0;
}

/**
 * Link preferido como `raw.url`: formulário/ATS externo primeiro (vira página
 * de candidatura); wa.me é o último recurso — o número já sai por `phones`.
 */
export function applyLinkOf(c: PostContacts): string | null {
  const nonWa = c.links.find((l) => !/wa\.me\/|whatsapp\.com\//i.test(l));
  return nonWa ?? c.links[0] ?? null;
}
