import type { CareerOpsConfig, ContractType, WorkModel } from '../config/careerOps.config';

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  needsReview?: boolean;
}

export interface EligibilityJobInput {
  scope: 'NATIONAL' | 'INTERNATIONAL' | 'BOTH';
  descriptionMarkdown: string;
  company?: string;
  title?: string;
}

const INTL_BLOCKLIST: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /us citizens only|u\.?s\.? citizen(ship)? (required|only)/i,
    reason: 'Exige cidadania dos EUA',
  },
  { pattern: /w2 only|w-2 only|w2 employees only/i, reason: 'Exige vínculo W2 local' },
  { pattern: /security clearance/i, reason: 'Exige Security Clearance' },
  {
    pattern: /unable to sponsor|no visa sponsorship|cannot sponsor|visa sponsorship unavailable/i,
    reason: 'Exige patrocínio de visto indisponível',
  },
  {
    pattern: /must (reside|be located|live) in (the )?(us|usa|united states)/i,
    reason: 'Exige residência nos EUA',
  },
  { pattern: /green card/i, reason: 'Exige Green Card' },
];

const INTL_FRIENDLY = /remote|worldwide|latam|anywhere|async|contractor|b2b|work from anywhere/i;
const NATIONAL_CONTRACT_PATTERNS: Record<ContractType, RegExp> = {
  CLT: /\bCLT\b/i,
  PJ: /\bPJ\b|pessoa jur[ií]dica/i,
};
const NATIONAL_REMOTE = /remoto|remote|home.?office/i;
const NATIONAL_HYBRID = /h[ií]brido|hybrid/i;

function mentionsAny(text: string, cities: string[]): boolean {
  const lower = text.toLowerCase();
  return cities.some((c) => lower.includes(c.toLowerCase()));
}

function declaresContract(text: string): boolean {
  return /\bCLT\b|\bPJ\b|pessoa jur[ií]dica|contrato|cooperado/i.test(text);
}

function checkInternational(job: EligibilityJobInput, config: CareerOpsConfig): EligibilityResult {
  const text = job.descriptionMarkdown;

  if (config.marketScope.international.blockVisaRequired) {
    for (const rule of INTL_BLOCKLIST) {
      if (rule.pattern.test(text)) return { eligible: false, reason: rule.reason };
    }
  }

  // Vaga sem região/modelo declarado: elegível mas sinalizada para revisão (DECISOES #6)
  if (!INTL_FRIENDLY.test(text)) {
    return { eligible: true, needsReview: true };
  }

  return { eligible: true };
}

function checkNational(job: EligibilityJobInput, config: CareerOpsConfig): EligibilityResult {
  const text = job.descriptionMarkdown;
  const nat = config.marketScope.national;

  // Modelo de trabalho
  const workModels: WorkModel[] = nat.workModels;
  const isRemote = NATIONAL_REMOTE.test(text);
  const isHybrid = NATIONAL_HYBRID.test(text);
  const isOnsite = /presencial|on.?site|100% onsite/i.test(text) && !isRemote && !isHybrid;

  if (isHybrid) {
    // Vagas híbridas são governadas pela lista de cidades permitidas:
    // se houver allowedCities, a vaga deve mencionar uma delas; sem lista,
    // exige HYBRID explícito em workModels.
    if (nat.allowedCities.length > 0) {
      if (!mentionsAny(text, nat.allowedCities)) {
        return { eligible: false, reason: 'Cidade híbrida fora da lista permitida' };
      }
    } else if (!workModels.includes('HYBRID')) {
      return { eligible: false, reason: 'Modelo híbrido não aceito' };
    }
  } else if (isOnsite && !workModels.includes('ONSITE')) {
    return { eligible: false, reason: 'Modelo presencial não aceito' };
  } else if (!isRemote && !isHybrid && !isOnsite) {
    if (!workModels.includes('REMOTE')) {
      // sem indicação de modelo: assume elegível mas revisável
      return { eligible: true, needsReview: true };
    }
  }

  // Contrato
  if (declaresContract(text)) {
    const contractOk = nat.contracts.some((c: ContractType) =>
      NATIONAL_CONTRACT_PATTERNS[c].test(text),
    );
    if (!contractOk) {
      return { eligible: false, reason: 'Modelo de contratação não aceito' };
    }
  }

  return { eligible: true };
}

/** Filtro de elegibilidade por escopo: visto, fuso, contrato, cidade (feature/08). */
export function checkEligibility(
  job: EligibilityJobInput,
  config: CareerOpsConfig,
): EligibilityResult {
  // marketScope.target (MARKET_SCOPE) é o gate de escopo — vaga detectada no
  // escopo desligado é recusada antes de qualquer outra regra (decisão #45).
  const target = config.marketScope.target;
  if (target === 'NATIONAL' && job.scope === 'INTERNATIONAL') {
    return { eligible: false, reason: 'Escopo internacional desligado (MARKET_SCOPE=NATIONAL)' };
  }
  if (target === 'INTERNATIONAL' && job.scope === 'NATIONAL') {
    return { eligible: false, reason: 'Escopo nacional desligado (MARKET_SCOPE=INTERNATIONAL)' };
  }

  if (job.scope === 'INTERNATIONAL') return checkInternational(job, config);
  if (job.scope === 'NATIONAL') return checkNational(job, config);

  // BOTH sem declaração de escopo: tenta nacional primeiro; se inelegível, intl —
  // mas só quando o target permite os dois.
  if (target === 'INTERNATIONAL') return checkInternational(job, config);
  const nat = checkNational(job, config);
  if (nat.eligible || target === 'NATIONAL') return nat;
  return checkInternational(job, config);
}
