import { evaluateStepResult } from '../../src/autofill/wizardNavigator';
import { fakePageState } from '../helpers/mocks';

describe('wizardNavigator — formulários multi-etapas', () => {
  it('avalia etapa preenchida sem erros como ADVANCE', () => {
    // feature/06: Avançar etapas de um formulário multi-etapas
    const step = fakePageState({ currentStep: 1, totalSteps: 4, validationErrors: [] });

    expect(evaluateStepResult(step)).toBe('ADVANCE');
  });

  it('avalia etapa com erro de validação como ESCALATE', () => {
    // feature/06: Interromper o avanço quando uma etapa apresenta erro
    const step = fakePageState({
      currentStep: 2,
      totalSteps: 4,
      validationErrors: ['Salary expectation is required'],
    });

    expect(evaluateStepResult(step)).toBe('ESCALATE');
  });

  it('avalia a última etapa como READY (tela final de revisão)', () => {
    // feature/06: repete até chegar na tela final de revisão
    const step = fakePageState({ currentStep: 4, totalSteps: 4, validationErrors: [] });

    expect(evaluateStepResult(step)).toBe('READY');
  });

  it('trata campos em Shadow DOM como preenchíveis', () => {
    // feature/06: campos dentro de estruturas encapsuladas são identificados
    const step = fakePageState({ isShadowDom: true, currentStep: 1, totalSteps: 2 });

    expect(evaluateStepResult(step)).toBe('ADVANCE');
  });
});
