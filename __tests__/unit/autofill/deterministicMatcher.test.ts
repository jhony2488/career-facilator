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

  it('uses profile standard answers for known questions', () => {
    // doc 03 (5.4): cached standard answers for recurring questions
    const fields = [makeField({ kind: 'textarea', label: 'When are you available to start?' })];

    const { matched } = matchFields(fields, profile);

    expect(matched[0]?.source).toBe('STANDARD_ANSWER');
  });
});
