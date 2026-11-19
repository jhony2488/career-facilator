export interface Recipient {
  email: string;
}

export interface RecipientJobInput {
  descriptionMarkdown: string;
}

export interface RecipientRepo {
  hasEmailSentTo(email: string, cooldownDays: number): Promise<boolean>;
}

export interface RecipientDeps {
  repo: RecipientRepo;
  cooldownDays?: number;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Prefixos ligados a recrutamento — prioridade máxima (feature/10). */
const RECRUITING_PREFIX =
  /^(careers?|jobs?|vagas|rh|recrutamento|recruit|talent|hiring|apply|cv|curriculo)/i;
/** Prefixos claramente não relacionados a contratação. */
const NON_RECRUITING_PREFIX =
  /^(finance|billing|press|support|suporte|sales|marketing|legal|privacy|security|abuse|postmaster|webmaster)/i;

function rank(email: string): number {
  const local = email.split('@')[0];
  if (RECRUITING_PREFIX.test(local)) return 3;
  if (NON_RECRUITING_PREFIX.test(local)) return 0;
  return 1; // genérico neutro (ex: contato) — só se não houver opção melhor
}

/**
 * Extrai e valida o destinatário de candidatura (feature/10): prioriza caixas
 * de recrutamento e bloqueia reenvio dentro do cooldown por destinatário.
 */
export async function resolveRecipient(
  job: RecipientJobInput,
  deps: RecipientDeps,
): Promise<Recipient | null> {
  const emails = [...new Set(job.descriptionMarkdown.match(EMAIL_RE) ?? [])];
  if (emails.length === 0) return null;

  const ranked = emails
    .map((email) => ({ email, score: rank(email) }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) return null;

  const cooldownDays = deps.cooldownDays ?? 30;
  for (const candidate of ranked) {
    const alreadySent = await deps.repo.hasEmailSentTo(candidate.email, cooldownDays);
    if (!alreadySent) return { email: candidate.email };
  }

  return null; // todos os candidatos em cooldown → anti-duplicidade
}
