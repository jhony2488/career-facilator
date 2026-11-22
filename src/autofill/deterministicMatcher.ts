export interface InspectedField {
  kind: 'input' | 'select' | 'textarea' | 'file';
  label: string;
  required: boolean;
  inShadowDom?: boolean;
  inIframe?: boolean;
  /** Atributo `name` do input — ajuda a casar sem depender só do label. */
  name?: string;
  /** Seletor data-cf-idx estável da inspeção — casa por identidade, não texto. */
  selector?: string;
}

export interface FieldMatch {
  field: InspectedField;
  value: string;
  source: 'PROFILE' | 'STANDARD_ANSWER' | 'AI_GENERATED';
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
}

type ProfileKey = 'fullName' | 'email' | 'phone' | 'linkedin' | 'github' | 'portfolio';

/** Dicionário de sinônimos de rótulos → chave do perfil (doc 03 §5.4). */
const FIELD_SYNONYMS: Record<ProfileKey, RegExp[]> = {
  fullName: [/\b(full\s*)?name\b/i, /\bnome\b/i, /nome completo/i],
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
};

const STANDARD_ANSWER_SYNONYMS: Array<{ answerKey: string; pattern: RegExp }> = [
  {
    answerKey: 'availability',
    pattern: /available to start|disponibilidade|when can you start|start date/i,
  },
  {
    answerKey: 'salaryExpectation',
    pattern: /salary expectation|pretens[ãa]o salarial|expected salary|compensation/i,
  },
];

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
export function matchFields(fields: InspectedField[], profile: MatcherProfile): MatchResult {
  const matched: FieldMatch[] = [];
  const unmatched: InspectedField[] = [];

  for (const field of fields) {
    // Upload de currículo é tratado pelo executor, não por texto
    if (field.kind === 'file') continue;

    const key = matchProfileKey(field.label);
    if (key) {
      const value = profile[key];
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

    unmatched.push(field);
  }

  return { matched, unmatched };
}
