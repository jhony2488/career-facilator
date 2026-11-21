import type { FieldMatch } from './deterministicMatcher';
import type { JobStatus } from '../db/repository';

export type SubmitMode = 'PAUSE_BEFORE_SUBMIT' | 'AUTO_SUBMIT';

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
}

export interface ExecuteFillOptions {
  matched?: FieldMatch[];
  aiAnswers?: Record<string, string>;
  resumePath?: string;
  submitMode: SubmitMode;
  /**
   * Ritmo humano (default true): caminho de mouse com jitter antes dos cliques
   * e digitação caractere a caractere — reduz bot-detection. `false` = direto.
   */
  humanPace?: boolean;
}

export interface ExecuteFillResult {
  fieldsFilled: number;
  resumeAttached: boolean;
  submitted: boolean;
  status: JobStatus;
  aiAnswersUsed?: string[];
  unmatchedHandled?: boolean;
  escalated?: boolean;
}

/**
 * Executor de preenchimento (doc 02/10, feature/06): injeta valores via eventos
 * nativos compatíveis com SPA, anexa o PDF adaptado e honra o modo de envio.
 */
export async function executeFill(
  page: PageStateLike,
  opts: ExecuteFillOptions,
): Promise<ExecuteFillResult> {
  const { matched = [], aiAnswers = {}, resumePath, submitMode } = opts;
  let fieldsFilled = 0;
  const aiAnswersUsed: string[] = [];

  const matchedByLabel = new Map(matched.map((m) => [m.field.label, m.value]));

  for (const field of page.fields) {
    if (field.kind === 'file') continue;

    const deterministicValue = matchedByLabel.get(field.label);
    if (deterministicValue !== undefined) {
      setNativeValue(field, deterministicValue);
      fieldsFilled++;
      continue;
    }

    const aiValue = aiAnswers[field.label];
    if (aiValue !== undefined) {
      setNativeValue(field, aiValue);
      fieldsFilled++;
      aiAnswersUsed.push(field.label);
    }
  }

  let resumeAttached = false;
  const fileField = page.fields.find((f) => f.kind === 'file');
  if (fileField && resumePath) {
    fileField.value = resumePath;
    resumeAttached = true;
  }

  if (page.hasCaptcha || page.requiresEmailOtp || page.validationErrors.length > 0) {
    return {
      fieldsFilled,
      resumeAttached,
      submitted: false,
      aiAnswersUsed,
      status: 'NEEDS_HUMAN_INPUT',
      unmatchedHandled: true,
      escalated: true,
    };
  }

  if (submitMode === 'AUTO_SUBMIT') {
    page.submitted = true;
    return { fieldsFilled, resumeAttached, submitted: true, aiAnswersUsed, status: 'APPLIED' };
  }

  return {
    fieldsFilled,
    resumeAttached,
    submitted: false,
    aiAnswersUsed,
    status: 'READY_TO_REVIEW',
    unmatchedHandled: true,
  };
}

/** Injeção nativa de eventos — dispara input/change para frameworks SPA (feature/06). */
function setNativeValue(field: PageFieldState, value: string): void {
  field.value = value;
  // No executor real: dispatchEvent(new Event('input', {bubbles:true})) + 'change'
}
