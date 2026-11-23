import { matchFields } from '../../../src/autofill/deterministicMatcher';
import type { FieldMatch } from '../../helpers/contracts';
import { makeField, makeMasterProfile } from '../../helpers/factories';

describe('matchFields — deterministic filling', () => {
  const profile = makeMasterProfile();

  it('fills standardized fields with profile data without AI', () => {
    // feature/06: Fill standardized fields without calling AI
    const fields = [
      makeField({ label: 'Full Name' }),
      makeField({ label: 'Email' }),
      makeField({ label: 'Phone' }),
      makeField({ label: 'LinkedIn' }),
      makeField({ label: 'GitHub' }),
    ];

    const { matched, unmatched } = matchFields(fields, profile);

    expect(unmatched).toEqual([]);
    expect(matched.map((m: FieldMatch) => m.value)).toEqual([
      profile.fullName,
      profile.email,
      profile.phone,
      profile.linkedin,
      profile.github,
    ]);
    expect(matched.every((m: FieldMatch) => m.source !== 'AI_GENERATED')).toBe(true);
  });

  it.each([
    ['E-mail Address', 'email'],
    ['Your Email', 'email'],
    ['Telefone', 'phone'],
    ['Phone Number', 'phone'],
    ['LinkedIn Profile URL', 'linkedin'],
    ['LinkedIn URL', 'linkedin'],
    ['Portfolio Website', 'portfolio'],
    ['GitHub Profile', 'github'],
  ])('recognizes label variation: "%s"', (label, _key) => {
    // feature/06: Recognize standardized fields by label variations
    const { matched } = matchFields([makeField({ label })], profile);

    expect(matched).toHaveLength(1);
    expect(matched[0].value.length).toBeGreaterThan(0);
  });

  it('returns unknown fields as unmatched for later decision', () => {
    // feature/06/09: unknown required field is not made up
    const fields = [makeField({ kind: 'textarea', label: 'Describe a challenge you solved' })];

    const { matched, unmatched } = matchFields(fields, profile);

    expect(matched).toEqual([]);
    expect(unmatched).toHaveLength(1);
  });

  it('does NOT fill someone-else urls (Company/Job URL) with the user portfolio', () => {
    // regression: `/url$/i` jogava o portfólio do usuário em "Company URL"
    const fields = [
      makeField({ label: 'Company URL' }),
      makeField({ label: 'Job posting URL' }),
      makeField({ label: 'Portfolio Website' }),
    ];

    const { matched, unmatched } = matchFields(fields, profile);

    expect(matched).toHaveLength(1);
    expect(matched[0].field.label).toBe('Portfolio Website');
    expect(unmatched.map((f) => f.label)).toEqual(['Company URL', 'Job posting URL']);
  });

  it('splits fullName into first/last name for separate fields', () => {
    // regression: First Name e Last Name recebiam o nome completo
    const fields = [makeField({ label: 'First Name' }), makeField({ label: 'Last Name' })];
    const { matched } = matchFields(fields, profile);

    const byLabel = new Map(matched.map((m) => [m.field.label, m.value]));
    expect(byLabel.get('First Name')).toBe('Dev');
    expect(byLabel.get('Last Name')).toBe('Tester');
  });

  it('uses profile standard answers for known questions', () => {
    // doc 03 (5.4): cached standard answers for recurring questions
    const fields = [makeField({ kind: 'textarea', label: 'When are you available to start?' })];

    const { matched } = matchFields(fields, profile);

    expect(matched[0]?.source).toBe('STANDARD_ANSWER');
  });

  it('matches a choice (radio group) by its QUESTION label, not option text', () => {
    // feature/06: choice fields carry the question as label; the intended
    // answer text is resolved to an option later by the executor
    const fields = [
      makeField({
        kind: 'choice',
        label: 'When are you available to start?',
        options: [
          { label: 'Immediately', selector: '[data-cf-idx="0"]' },
          { label: 'In 2 weeks', selector: '[data-cf-idx="1"]' },
        ],
      }),
    ];

    const { matched, unmatched } = matchFields(fields, profile);

    expect(unmatched).toEqual([]);
    expect(matched[0]?.source).toBe('STANDARD_ANSWER');
  });
});
