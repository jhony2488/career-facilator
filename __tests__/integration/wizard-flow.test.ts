import { evaluateStepResult } from '../../src/autofill/wizardNavigator';
import { fakePageState } from '../helpers/mocks';

describe('wizardNavigator — multi-step forms', () => {
  it('evaluates a step filled without errors as ADVANCE', () => {
    // feature/06: Advance the steps of a multi-step form
    const step = fakePageState({ currentStep: 1, totalSteps: 4, validationErrors: [] });

    expect(evaluateStepResult(step)).toBe('ADVANCE');
  });

  it('evaluates a step with a validation error as ESCALATE', () => {
    // feature/06: Stop advancing when a step shows an error
    const step = fakePageState({
      currentStep: 2,
      totalSteps: 4,
      validationErrors: ['Salary expectation is required'],
    });

    expect(evaluateStepResult(step)).toBe('ESCALATE');
  });

  it('evaluates the last step as READY (final review screen)', () => {
    // feature/06: repeat until reaching the final review screen
    const step = fakePageState({ currentStep: 4, totalSteps: 4, validationErrors: [] });

    expect(evaluateStepResult(step)).toBe('READY');
  });

  it('treats fields in Shadow DOM as fillable', () => {
    // feature/06: fields inside encapsulated structures are identified
    const step = fakePageState({ isShadowDom: true, currentStep: 1, totalSteps: 2 });

    expect(evaluateStepResult(step)).toBe('ADVANCE');
  });
});
