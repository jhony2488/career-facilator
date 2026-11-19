export type OutcomeStatus = 'REJECTED' | 'ASSESSMENT_INVITED' | 'INTERVIEW';

export interface IncomingMessage {
  from: string;
  subject: string;
  body: string;
}

const REJECTION_PATTERNS = [
  /unfortunately.{0,40}(not|won't|will not|no longer) (move|proceed|continue)/i,
  /not moving forward/i,
  /decided to (move forward|proceed) with (other|another) candidate/i,
  /position has been filled/i,
  /optamos por seguir com outro/i,
  /n[ãa]o daremos continuidade/i,
  /infelizmente.{0,40}(n[ãa]o|outro candidato)/i,
  /outra oportunidade/i,
];

const ASSESSMENT_PATTERNS = [
  /technical (assessment|test|challenge)/i,
  /coding (challenge|test|exercise)/i,
  /complete the (following|next) (assessment|test)/i,
  /take[- ]home/i,
  /teste t[ée]cnico/i,
  /desafio t[ée]cnico/i,
  /avalia[çc][ãa]o t[ée]cnica/i,
];

const INTERVIEW_PATTERNS = [
  /invite you to (an )?interview/i,
  /schedule (an )?interview/i,
  /interview (invitation|invite)/i,
  /next (step|stage).{0,30}interview/i,
  /agendar (uma )?entrevista/i,
  /convidar.{0,20}entrevista/i,
  /convite.{0,20}entrevista/i,
  /entrevista com voc[êe]/i,
];

const AUTO_REPLY_HINTS =
  /noreply|no-reply|donotreply|application received|recebemos sua candidatura|will review it/i;

function domainOf(from: string): string {
  const at = from.lastIndexOf('@');
  return at === -1 ? '' : from.slice(at + 1).toLowerCase();
}

/**
 * Classifica respostas de empresas aplicadas (feature/12). Ignora remetentes
 * sem candidatura e auto-replies sem desfecho identificável.
 */
export function classifyOutcome(
  message: IncomingMessage,
  appliedSenders: string[],
): OutcomeStatus | null {
  const domain = domainOf(message.from);
  if (
    !domain ||
    !appliedSenders.some(
      (d) => domain === d.toLowerCase() || domain.endsWith(`.${d.toLowerCase()}`),
    )
  ) {
    return null;
  }

  const text = `${message.subject}\n${message.body}`;

  if (ASSESSMENT_PATTERNS.some((p) => p.test(text))) return 'ASSESSMENT_INVITED';
  if (INTERVIEW_PATTERNS.some((p) => p.test(text))) return 'INTERVIEW';
  if (REJECTION_PATTERNS.some((p) => p.test(text))) return 'REJECTED';

  // Auto-reply genérica ("received your application") não muda status
  if (AUTO_REPLY_HINTS.test(text)) return null;
  return null;
}
