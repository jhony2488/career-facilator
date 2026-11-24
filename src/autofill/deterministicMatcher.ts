export interface InspectedField {
  kind: 'input' | 'select' | 'textarea' | 'file' | 'choice';
  label: string;
  required: boolean;
  inShadowDom?: boolean;
  inIframe?: boolean;
  /** Atributo `name` do input — ajuda a casar sem depender só do label. */
  name?: string;
  /** Seletor data-cf-idx estável da inspeção — casa por identidade, não texto. */
  selector?: string;
  /** Alternativas de `choice` (grupo de radios) — executor mapeia resposta→opção. */
  options?: Array<{ label: string; value?: string; selector: string }>;
}

export interface FieldMatch {
  field: InspectedField;
  value: string;
  source: 'PROFILE' | 'STANDARD_ANSWER' | 'AI_GENERATED' | 'DEFAULT';
}

export interface MatchResult {
  matched: FieldMatch[];
  unmatched: InspectedField[];
}

export interface MatcherProfile {
  fullName: string;
  email: string;
  phone: string;
  linkedin: string;
  github: string;
  portfolio: string;
  standardAnswers: Record<string, string>;
  /** "Cidade, UF[, País]" — alimenta campos de cidade/estado/país/localização. */
  location?: string;
}

type ProfileKey =
  | 'fullName'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'linkedin'
  | 'github'
  | 'portfolio'
  | 'city'
  | 'country'
  | 'state'
  | 'location';

/** Dicionário de sinônimos de rótulos → chave do perfil (doc 03 §5.4). */
const FIELD_SYNONYMS: Record<ProfileKey, RegExp[]> = {
  // Ordem importa: First/Last Name são testados antes de Full Name/Name.
  firstName: [/\bfirst\s*name\b/i, /\bnome\b(?![\s_-](?:completo|sobrenome))/i],
  lastName: [/\blast\s*name\b/i, /\bsobrenome\b/i, /\bsurname\b/i],
  fullName: [/\bfull\s*name\b/i, /\byour\s*name\b/i, /^name$/i, /nome completo/i],
  email: [/e-?mail/i, /email address/i, /correo/i],
  phone: [/phone/i, /telefone/i, /celular/i, /mobile/i],
  linkedin: [/linkedin/i],
  github: [/github/i],
  // `/url$/i` sozinho preenchia "Company URL"/"Job URL" com o SEU portfólio.
  portfolio: [
    /portfolio/i,
    /portf[óo]lio/i,
    /personal (site|page|url)/i,
    /your website/i,
    /site pessoal/i,
  ],
  // Endereço — derivados de `location` ("Cidade, UF[, País]"); o que o perfil
  // não tem (rua, CEP) segue p/ resposta padrão do usuário ou escalonamento.
  city: [/\bcity\b/i, /\bcidade\b/i],
  country: [/\bcountry\b/i, /\bpa[ií]s\b/i],
  state: [/\bstate\b/i, /\bprovinc/i, /\bestado\b(?![\s_-]*civil)/i, /\buf\b/i],
  location: [/current location|where.*(live|reside)|location|localiza[çc][aã]o/i],
};

function locationPart(loc: string | undefined, idx: number): string | undefined {
  return loc
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean)[idx];
}

function profileValue(key: ProfileKey, profile: MatcherProfile): string | undefined {
  const parts = profile.fullName.split(/\s+/).filter(Boolean);
  if (key === 'firstName') return parts[0] ?? '';
  if (key === 'lastName') return parts.slice(1).join(' ') ?? '';
  if (key === 'city') return locationPart(profile.location, 0);
  if (key === 'state') return locationPart(profile.location, 1);
  if (key === 'country') return locationPart(profile.location, 2);
  const value = profile[key];
  return typeof value === 'string' ? value : undefined;
}

const STANDARD_ANSWER_SYNONYMS: Array<{ answerKey: string; pattern: RegExp }> = [
  {
    answerKey: 'availability',
    pattern: /available to start|disponibilidade|when can you start|start date/i,
  },
  {
    answerKey: 'salaryExpectation',
    pattern: /salary expectation|pretens[ãa]o salarial|expected salary|compensation/i,
  },
  {
    answerKey: 'noticePeriod',
    pattern:
      /notice period|prazo de recis[aã]o|aviso pr[eé]vio|quanto tempo de aviso|tempo de recis/i,
  },
  {
    answerKey: 'authorizedToWork',
    pattern:
      /authorized to work|legally authorized|eligible to work|right to work|autorizado a trabalhar|permiss[aã]o de trabalho/i,
  },
  {
    answerKey: 'requiresSponsorship',
    pattern: /sponsor|sponsorship|visto patrocin|patroc[ií]nio|necessita.*visto/i,
  },
  {
    answerKey: 'englishLevel',
    pattern: /english (level|proficiency|fluency)|n[ií]vel de ingl[eê]s|flu[eê]ncia em ingl[eê]s/i,
  },
  {
    answerKey: 'yearsExperience',
    pattern: /years of experience|anos de experi[eê]ncia|how many years|quantos anos/i,
  },
  {
    answerKey: 'remoteExperience',
    pattern: /remote experience|experi[eê]ncia remoto|worked remote|trabalho remoto/i,
  },
  // Endereço — usuário escreve na seção "Respostas Padrão" do perfil
  // (chaves address/addressLine2/postalCode/city/state/country); sem a chave,
  // o campo segue p/ escalonamento — nada de endereço inventado.
  {
    answerKey: 'addressLine2',
    pattern: /address\s*line\s*[2-9]|complemento|apto\b|apartment|\bsuite\b|\bapt\b/i,
  },
  {
    answerKey: 'address',
    pattern: /address|street|endere[çc]o|logradouro|\brua\b/i,
  },
  {
    answerKey: 'postalCode',
    pattern: /postal code|zip ?code|\bcep\b|c[óo]digo postal/i,
  },
  {
    answerKey: 'city',
    pattern: /\bcity\b|\bcidade\b/i,
  },
  {
    answerKey: 'state',
    pattern: /\bstate\b|\bprovinc|\bestado\b(?![\s_-]*civil)|\buf\b/i,
  },
  {
    answerKey: 'country',
    pattern: /\bcountry\b|\bpa[ií]s\b/i,
  },
];

/** "Address Line 2"/complemento: nunca herda o logradouro por substring/fuzzy. */
const EXTRA_ADDRESS_RE =
  /address\s*(line)?\s*[2-9]|complemento|apto\b|apartment|\bsuite\b|\bapt\b/i;

function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(
    normKey(s)
      .split(' ')
      .filter((t) => t.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  return intersection.size / (a.size + b.size - intersection.size);
}

function fuzzyLookup(
  label: string,
  answers: Record<string, string> | undefined,
  threshold: number,
): string | undefined {
  if (!answers || Object.keys(answers).length === 0 || threshold <= 0) return undefined;
  if (answers[label] !== undefined) return answers[label];
  const target = tokenSet(label);
  let best: { key: string; score: number } | null = null;
  const lowerLabel = label.toLowerCase();
  for (const [key] of Object.entries(answers)) {
    const lowerKey = key.toLowerCase();
    // Substring exata (case-insensitive) vale como match perfeito — permite
    // chaves genéricas como "authorized to work" casarem perguntas longas.
    if (lowerLabel.includes(lowerKey) || lowerKey.includes(lowerLabel)) {
      return answers[key];
    }
    const score = jaccard(target, tokenSet(key));
    if (score >= threshold && (!best || score > best.score)) best = { key, score };
  }
  return best ? answers[best.key] : undefined;
}

function matchProfileKey(label: string): ProfileKey | undefined {
  for (const [key, patterns] of Object.entries(FIELD_SYNONYMS) as Array<[ProfileKey, RegExp[]]>) {
    if (patterns.some((p) => p.test(label))) return key;
  }
  return undefined;
}

/**
 * Preenchimento determinístico (doc 03 §5.4, feature/06): resolve campos
 * padronizados via sinônimos — 0 chamadas de IA. Textareas inéditas voltam
 * como `unmatched` para decisão posterior (IA ou escalonamento).
 */
export function matchFields(
  fields: InspectedField[],
  profile: MatcherProfile,
  fieldDefaults?: Record<string, string>,
): MatchResult {
  const matched: FieldMatch[] = [];
  const unmatched: InspectedField[] = [];

  for (const field of fields) {
    // Upload de currículo é tratado pelo executor, não por texto
    if (field.kind === 'file') continue;

    const key = matchProfileKey(field.label);
    if (key) {
      const value = profileValue(key, profile);
      if (typeof value === 'string' && value.length > 0) {
        matched.push({ field, value, source: 'PROFILE' });
        continue;
      }
    }

    const std = STANDARD_ANSWER_SYNONYMS.find((s) => s.pattern.test(field.label));
    if (std && profile.standardAnswers[std.answerKey]) {
      matched.push({
        field,
        value: profile.standardAnswers[std.answerKey],
        source: 'STANDARD_ANSWER',
      });
      continue;
    }

    if (EXTRA_ADDRESS_RE.test(field.label)) {
      // "Address Line 2"/complemento: só resposta explícita pelo rótulo exato
      // — substring de "address" jogaria o logradouro duplicado aqui.
      const explicit = fieldDefaults?.[field.label] ?? profile.standardAnswers[field.label];
      if (explicit?.length) {
        matched.push({ field, value: explicit, source: 'DEFAULT' });
      } else {
        unmatched.push(field);
      }
      continue;
    }

    // "Respostas Padrão" do perfil também casa por fuzzy — chaves livres do
    // usuário (ex.: "endereço", "CEP") respondem as perguntas equivalentes.
    const stdFuzzy = fuzzyLookup(field.label, profile.standardAnswers, 0.8);
    if (stdFuzzy !== undefined && stdFuzzy.length > 0) {
      matched.push({ field, value: stdFuzzy, source: 'STANDARD_ANSWER' });
      continue;
    }

    const defaultValue = fuzzyLookup(field.label, fieldDefaults, 0.8);
    if (defaultValue !== undefined && defaultValue.length > 0) {
      matched.push({ field, value: defaultValue, source: 'DEFAULT' });
      continue;
    }

    unmatched.push(field);
  }

  return { matched, unmatched };
}
