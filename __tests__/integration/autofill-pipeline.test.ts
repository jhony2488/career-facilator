import { matchFields } from '../../src/autofill/deterministicMatcher';
import { executeFill } from '../../src/autofill/formExecutor';
import { makeMasterProfile, makeField } from '../helpers/factories';
import { fakePageState } from '../helpers/mocks';

describe('Pipeline de autofill: inspeção → match determinístico → execução', () => {
  const profile = makeMasterProfile();

  it('preenche campos padrão, anexa currículo e pausa antes do envio em modo revisão', async () => {
    // feature/06: pausa antes do envio final quando o modo exige aprovação
    const page = fakePageState();
    const inspected = page.fields.map((f) =>
      makeField({ kind: f.kind as never, label: f.label, required: f.required }),
    );

    // 1. Match determinístico (0 IA)
    const { matched, unmatched } = matchFields(inspected, profile);
    expect(matched.length).toBeGreaterThan(0);

    // 2. Execução — inclui upload do PDF adaptado
    const result = await executeFill(page, {
      matched,
      aiAnswers: { 'Describe a complex technical challenge': 'I solved...' },
      resumePath: 'storage/generated_resumes/job-001.pdf',
      submitMode: 'PAUSE_BEFORE_SUBMIT',
    });

    expect(result.fieldsFilled).toBe(matched.length);
    expect(result.resumeAttached).toBe(true);
    expect(result.submitted).toBe(false);
    expect(result.status).toBe('READY_TO_REVIEW');

    // Campos sem match determinístico precisaram de decisão (IA ou escalonamento)
    if (unmatched.length > 0) {
      expect(result.unmatchedHandled).toBeDefined();
    }
  });

  it('resolve pergunta dissertativa inédita com resposta gerada por IA', async () => {
    // feature/06: Acionar IA apenas para pergunta dissertativa inédita
    const page = fakePageState({
      fields: [
        { kind: 'input', label: 'Email', required: true },
        { kind: 'textarea', label: 'Describe a complex technical challenge', required: true },
      ],
    });

    const { unmatched } = matchFields(
      page.fields.map((f) => makeField({ kind: f.kind as never, label: f.label, required: f.required })),
      profile,
    );
    expect(unmatched).toHaveLength(1);

    const result = await executeFill(page, {
      aiAnswers: { 'Describe a complex technical challenge': 'I solved a multi-tenant latency issue...' },
      submitMode: 'PAUSE_BEFORE_SUBMIT',
    });

    expect(result.aiAnswersUsed).toContain('Describe a complex technical challenge');
  });

  it('não submete quando submitMode é PAUSE_BEFORE_SUBMIT', async () => {
    // feature/06 + feature/07: SEMI_AUTO sempre pausa
    const page = fakePageState();
    const result = await executeFill(page, { submitMode: 'PAUSE_BEFORE_SUBMIT' });

    expect(result.submitted).toBe(false);
    expect(page.submitted).toBe(false);
  });
});
