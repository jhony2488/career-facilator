import { matchFields } from '../../src/autofill/deterministicMatcher';
import { executeFill } from '../../src/autofill/formExecutor';
import { makeMasterProfile, makeField } from '../helpers/factories';
import { fakePageState } from '../helpers/mocks';

describe('Autofill pipeline: inspection → deterministic match → execution', () => {
  const profile = makeMasterProfile();

  it('fills standard fields, attaches the resume and pauses before submitting in review mode', async () => {
    // feature/06: pause before final submission when the mode requires approval
    const page = fakePageState();
    const inspected = page.fields.map((f) =>
      makeField({ kind: f.kind as never, label: f.label, required: f.required }),
    );

    // 1. Deterministic match (0 AI)
    const { matched, unmatched } = matchFields(inspected, profile);
    expect(matched.length).toBeGreaterThan(0);

    // 2. Execution — includes uploading the tailored PDF
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

    // Fields without a deterministic match required a decision (AI or escalation)
    if (unmatched.length > 0) {
      expect(result.unmatchedHandled).toBeDefined();
    }
  });

  it('answers a novel essay question with an AI-generated response', async () => {
    // feature/06: Trigger AI only for a novel essay question
    const page = fakePageState({
      fields: [
        { kind: 'input', label: 'Email', required: true },
        { kind: 'textarea', label: 'Describe a complex technical challenge', required: true },
      ],
    });

    const { unmatched } = matchFields(
      page.fields.map((f) =>
        makeField({ kind: f.kind as never, label: f.label, required: f.required }),
      ),
      profile,
    );
    expect(unmatched).toHaveLength(1);

    const result = await executeFill(page, {
      aiAnswers: {
        'Describe a complex technical challenge': 'I solved a multi-tenant latency issue...',
      },
      submitMode: 'PAUSE_BEFORE_SUBMIT',
    });

    expect(result.aiAnswersUsed).toContain('Describe a complex technical challenge');
  });

  it('does not submit when submitMode is PAUSE_BEFORE_SUBMIT', async () => {
    // feature/06 + feature/07: SEMI_AUTO always pauses
    const page = fakePageState();
    const result = await executeFill(page, { submitMode: 'PAUSE_BEFORE_SUBMIT' });

    expect(result.submitted).toBe(false);
    expect(page.submitted).toBe(false);
  });
});
