import { matchFields } from '../../../src/autofill/deterministicMatcher';
import type { FieldMatch } from '../../helpers/contracts';
import { makeField, makeMasterProfile } from '../../helpers/factories';

describe('matchFields — preenchimento determinístico', () => {
  const profile = makeMasterProfile();

  it('preenche campos padronizados com dados do perfil sem IA', () => {
    // feature/06: Preencher campos padronizados sem chamar IA
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
  ])('reconhece variação de rótulo: "%s"', (label, _key) => {
    // feature/06: Reconhecer campos padronizados por variações de rótulo
    const { matched } = matchFields([makeField({ label })], profile);

    expect(matched).toHaveLength(1);
    expect(matched[0].value.length).toBeGreaterThan(0);
  });

  it('retorna campos desconhecidos como unmatched para decisão posterior', () => {
    // feature/06/09: campo obrigatório desconhecido não é inventado
    const fields = [makeField({ kind: 'textarea', label: 'Describe a challenge you solved' })];

    const { matched, unmatched } = matchFields(fields, profile);

    expect(matched).toEqual([]);
    expect(unmatched).toHaveLength(1);
  });

  it('usa respostas padrão do perfil para perguntas conhecidas', () => {
    // doc 03 (5.4): respostas padrão em cache para perguntas recorrentes
    const fields = [makeField({ kind: 'textarea', label: 'When are you available to start?' })];

    const { matched } = matchFields(fields, profile);

    expect(matched[0]?.source).toBe('STANDARD_ANSWER');
  });
});
