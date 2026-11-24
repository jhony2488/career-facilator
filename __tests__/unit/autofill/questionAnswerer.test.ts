import { buildAnswersPrompt, parseAnswers } from '../../../src/autofill/questionAnswerer';

describe('buildAnswersPrompt — live answer batching', () => {
  it('includes the job context, each question and its options verbatim', () => {
    // feature/06: live answering — the model sees the form's real questions
    const prompt = buildAnswersPrompt(
      {
        jobTitle: 'Senior TypeScript Dev',
        company: 'ACME',
        jobExcerpt: 'node api backend',
        profileContext: '### stack\nTypeScript, Node',
      },
      [
        {
          label: 'Experience with Node.js?',
          kind: 'choice',
          required: true,
          options: ['Yes, substantial', 'No'],
        },
        { label: 'Why do you want this job?', kind: 'textarea', required: false },
      ],
    );

    expect(prompt).toContain('Senior TypeScript Dev');
    expect(prompt).toContain('ACME');
    expect(prompt).toContain('### stack');
    expect(prompt).toContain('Experience with Node.js?');
    expect(prompt).toContain('Yes, substantial');
    expect(prompt).toContain('Why do you want this job?');
  });
});

describe('parseAnswers — anti-fabrication sanitation', () => {
  it('unwraps the {answers:{…}} envelope and drops empty/non-string values', () => {
    const out = parseAnswers({
      answers: {
        'Question one?': 'yes',
        'Question two?': '   ',
        'Question three?': 42,
      },
    });

    expect(out).toEqual({ 'Question one?': 'yes' });
  });

  it('accepts a bare record and rejects non-objects', () => {
    expect(parseAnswers({ A: 'b' })).toEqual({ A: 'b' });
    expect(parseAnswers(null)).toEqual({});
    expect(parseAnswers('text')).toEqual({});
    expect(parseAnswers(['a'])).toEqual({});
  });
});
