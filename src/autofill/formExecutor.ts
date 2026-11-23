import type { FieldMatch } from './deterministicMatcher';
import type { JobStatus } from '../db/repository';

export type SubmitMode = 'PAUSE_BEFORE_SUBMIT' | 'AUTO_SUBMIT';

/** Alternativa de um campo `choice` (grupo exclusivo — radios por `name`). */
export interface ChoiceOption {
  label: string;
  value?: string;
  selector: string;
}

export interface PageFieldState {
  kind: string;
  label: string;
  required: boolean;
  value?: string;
  /** Seletor CSS do elemento (páginas reais via pageInspector). */
  selector?: string;
  /** name/placeholder do input — ajuda a distinguir labels genéricas. */
  name?: string;
  /** Índice em page.frames() onde o seletor resolve — ausente = frame principal. */
  frameIdx?: number;
  /** Alternativas quando `kind==='choice'` — label da pergunta no próprio campo. */
  options?: ChoiceOption[];
}

/** Campo sem resposta por nenhuma fonte — enviado à LLM ao vivo (1× por etapa). */
export interface UnresolvedQuestion {
  label: string;
  kind: string;
  required: boolean;
  /** Textos das alternativas quando `kind==='choice'`. */
  options?: string[];
}

/** Visão serializável da página — o que o executor enxerga do navegador. */
export interface PageStateLike {
  url: string;
  fields: PageFieldState[];
  hasCaptcha: boolean;
  requiresEmailOtp: boolean;
  /** Tela de login/auth do portal — escalonamento abre browser visível p/ o usuário logar. */
  requiresLogin?: boolean;
  validationErrors: string[];
  alreadyAppliedBanner: boolean;
  currentStep: number;
  totalSteps: number;
  isShadowDom: boolean;
  submitted: boolean;
  /**
   * Zonas de upload sem input[type=file] (dropzones/labels de arrastar) —
   * fallback de anexo via eventos drop com DataTransfer.
   */
  dropzones?: Array<{ selector: string; frameIdx?: number }>;
  /**
   * Handle da página real (Playwright Page, opaco). Presente só em páginas
   * vivas criadas pelo pageInspector — executores usam-na p/ agir no DOM.
   * `unknown` de propósito: pipeline/testes nunca importam playwright.
   */
  dom?: unknown;
  /**
   * E-mail `mailto:` revelado na cadena de candidatura (página destino sin
   * form pero con contacto) — el reteste lo reporta para resolución manual.
   */
  contactEmail?: string;
}

export interface ExecuteFillOptions {
  matched?: FieldMatch[];
  aiAnswers?: Record<string, string>;
  /**
   * Defaults configuráveis pelo usuário para campos obrigatórios que não casaram
   * com sinônimos de perfil. Ex.: `authorized to work: yes`.
   */
  fieldDefaults?: Record<string, string>;
  /**
   * Limiar de similaridade entre a label do campo e a chave das respostas do
   * tailor (0..1). 0 = desligado; 0.9 = muito conservador (padrão).
   */
  fuzzyThreshold?: number;
  resumePath?: string;
  submitMode: SubmitMode;
  /**
   * Ritmo humano (default true): caminho de mouse com jitter antes dos cliques
   * e digitação caractere a caractere — reduz bot-detection. `false` = direto.
   */
  humanPace?: boolean;
  /**
   * `AUTOFILL_DEBUG_FILL` — loga cada campo preenchido (label → valor → fonte),
   * anexos e o submit. Diagnóstico de "valor errado em campo X".
   */
  debug?: boolean;
  /**
   * Resposta ao vivo (tier SMART) para campos sem valor por nenhuma fonte —
   * 1 chamada batelada por etapa do wizard; `null`/falha = campo segue
   * sem resposta (escalonamento normal). Regra anti-fabricação: campo
   * required respondido só aqui derruba AUTO_SUBMIT p/ PAUSE.
   */
  answerQuestions?: (questions: UnresolvedQuestion[]) => Promise<Record<string, string> | null>;
}

export interface ExecuteFillResult {
  fieldsFilled: number;
  resumeAttached: boolean;
  submitted: boolean;
  status: JobStatus;
  aiAnswersUsed?: string[];
  unmatchedHandled?: boolean;
  escalated?: boolean;
  /** Respostas geradas ao vivo e efetivamente usadas (label → resposta). */
  liveAnswers?: Record<string, string>;
  /** Labels de campos required que ficaram sem valor mesmo após a LLM. */
  unansweredRequired?: string[];
}

/**
 * Executor de preenchimento (doc 02/10, feature/06): injeta valores via eventos
 * nativos compatíveis com SPA, anexa o PDF adaptado e honra o modo de envio.
 */
export async function executeFill(
  page: PageStateLike,
  opts: ExecuteFillOptions,
): Promise<ExecuteFillResult> {
  const {
    matched = [],
    aiAnswers = {},
    fieldDefaults = {},
    fuzzyThreshold = 0.9,
    resumePath,
    submitMode,
    answerQuestions,
  } = opts;
  let fieldsFilled = 0;
  const aiAnswersUsed: string[] = [];
  const liveAnswers: Record<string, string> = {};
  const liveRequiredUsed = new Set<string>();
  const unansweredRequired = new Set<string>();
  const liveNorm = new Map<string, string>();

  const matchedBySelector = new Map(
    matched.filter((m) => m.field.selector).map((m) => [m.field.selector as string, m.value]),
  );
  const matchedByLabel = new Map(matched.map((m) => [m.field.label, m.value]));
  const matchedByName = new Map(
    matched.filter((m) => m.field.name).map((m) => [m.field.name as string, m.value]),
  );

  const resolveValue = (field: PageFieldState): { value?: string; source?: string } => {
    if (field.selector && matchedBySelector.has(field.selector)) {
      return { value: matchedBySelector.get(field.selector), source: 'PROFILE' };
    }
    if (field.name && matchedByName.has(field.name)) {
      return { value: matchedByName.get(field.name), source: 'PROFILE' };
    }
    if (matchedByLabel.has(field.label)) {
      const src = matched.find((m) => m.field.label === field.label)?.source;
      return { value: matchedByLabel.get(field.label), source: src };
    }
    if (aiAnswers[field.label] !== undefined) {
      return { value: aiAnswers[field.label], source: 'AI_GENERATED' };
    }
    const fuzzy = fuzzyValue(field.label, aiAnswers, fuzzyThreshold);
    if (fuzzy) return { value: fuzzy, source: 'AI_GENERATED' };
    const live = liveNorm.get(normKey(field.label));
    if (live !== undefined) return { value: live, source: 'AI_LIVE' };
    const def = fuzzyValue(field.label, fieldDefaults, 0.8);
    if (def) return { value: def, source: 'DEFAULT' };
    return {};
  };

  // LLM ao vivo: campos sem resposta por nenhuma fonte → 1 chamada batelada.
  if (answerQuestions) {
    const unresolved = page.fields
      .filter((f) => f.kind !== 'file' && resolveValue(f).value === undefined)
      .map((f) => ({
        label: f.label,
        kind: f.kind,
        required: f.required,
        options: f.options?.map((o) => o.label),
      }));
    if (unresolved.length) {
      const got = await answerQuestions(unresolved).catch(() => null);
      if (got) {
        for (const [k, v] of Object.entries(got)) {
          if (v && v.trim()) liveNorm.set(normKey(k), v);
        }
      }
    }
  }

  for (const field of page.fields) {
    if (field.kind === 'file') continue;

    const resolved = resolveValue(field);
    if (resolved.value === undefined) {
      if (field.required) unansweredRequired.add(field.label);
      continue;
    }
    if (field.kind === 'choice') {
      const option = field.options ? pickOption(resolved.value, field.options) : undefined;
      if (!option) {
        if (field.required) unansweredRequired.add(field.label);
        continue;
      }
      field.value = option.label;
    } else {
      setNativeValue(field, resolved.value);
    }
    fieldsFilled++;
    if (resolved.source === 'AI_GENERATED') aiAnswersUsed.push(field.label);
    if (resolved.source === 'AI_LIVE') {
      liveAnswers[field.label] = resolved.value;
      if (field.required) liveRequiredUsed.add(field.label);
    }
  }

  let resumeAttached = false;
  const fileField = page.fields.find((f) => f.kind === 'file');
  if (fileField && resumePath) {
    fileField.value = resumePath;
    resumeAttached = true;
  }

  const extra = {
    ...(Object.keys(liveAnswers).length ? { liveAnswers } : {}),
    ...(unansweredRequired.size ? { unansweredRequired: [...unansweredRequired] } : {}),
  };

  if (page.hasCaptcha || page.requiresEmailOtp || page.validationErrors.length > 0) {
    return {
      fieldsFilled,
      resumeAttached,
      submitted: false,
      aiAnswersUsed,
      status: 'NEEDS_HUMAN_INPUT',
      unmatchedHandled: true,
      escalated: true,
      ...extra,
    };
  }

  // Anti-fabricação: required respondida só pela LLM ao vivo ⇒ pausa p/ revisão.
  if (submitMode === 'AUTO_SUBMIT' && liveRequiredUsed.size === 0) {
    page.submitted = true;
    return {
      fieldsFilled,
      resumeAttached,
      submitted: true,
      aiAnswersUsed,
      status: 'APPLIED',
      ...extra,
    };
  }

  return {
    fieldsFilled,
    resumeAttached,
    submitted: false,
    aiAnswersUsed,
    status: 'READY_TO_REVIEW',
    unmatchedHandled: true,
    ...extra,
  };
}

/** Injeção nativa de eventos — dispara input/change para frameworks SPA (feature/06). */
function setNativeValue(field: PageFieldState, value: string): void {
  field.value = value;
  // No executor real: dispatchEvent(new Event('input', {bubbles:true})) + 'change'
}

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

function fuzzyValue(
  label: string,
  answers: Record<string, string>,
  threshold: number,
): string | undefined {
  if (!answers || Object.keys(answers).length === 0 || threshold <= 0) return undefined;
  if (answers[label] !== undefined) return answers[label];
  const target = tokenSet(label);
  let best: { key: string; score: number } | null = null;
  for (const key of Object.keys(answers)) {
    const score = jaccard(target, tokenSet(key));
    if (score >= threshold && (!best || score > best.score)) best = { key, score };
  }
  return best ? answers[best.key] : undefined;
}

const YES_RE = /^(y|yes|s|sim)\b/i;
const NO_RE = /^(n|no|n[aã]o)\b/i;

/**
 * Resposta em texto → alternativa de `choice`: normalizada exata →
 * contenção (qualquer direção) → jaccard ≥0.5 → mapa sim/não.
 */
export function pickOption(answer: string, options: ChoiceOption[]): ChoiceOption | undefined {
  const target = normKey(answer);
  if (!target) return undefined;
  const exact = options.find(
    (o) => normKey(o.label) === target || normKey(o.value ?? '') === target,
  );
  if (exact) return exact;
  const contained = options.find(
    (o) => normKey(o.label).includes(target) || target.includes(normKey(o.label)),
  );
  if (contained) return contained;
  const tokens = tokenSet(answer);
  let best: { option: ChoiceOption; score: number } | null = null;
  for (const option of options) {
    const score = jaccard(tokens, tokenSet(option.label));
    if (score >= 0.5 && (!best || score > best.score)) best = { option, score };
  }
  if (best) return best.option;
  const trimmed = answer.trim();
  if (YES_RE.test(trimmed)) return options.find((o) => YES_RE.test(o.label));
  if (NO_RE.test(trimmed)) return options.find((o) => NO_RE.test(o.label));
  return undefined;
}
