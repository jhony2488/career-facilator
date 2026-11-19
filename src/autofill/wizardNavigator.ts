export type StepVerdict = 'ADVANCE' | 'ESCALATE' | 'READY';

export interface StepState {
  currentStep: number;
  totalSteps: number;
  validationErrors: string[];
}

/**
 * Loop de navegação em formulários multi-etapas (doc 10, feature/06):
 * erro de validação → escalona; última etapa → revisão; senão → avança.
 */
export function evaluateStepResult(step: StepState): StepVerdict {
  if (step.validationErrors.length > 0) return 'ESCALATE';
  if (step.currentStep >= step.totalSteps) return 'READY';
  return 'ADVANCE';
}
