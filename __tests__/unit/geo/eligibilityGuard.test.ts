import { checkEligibility } from '../../../src/geo/eligibilityGuard';
import { makeConfig, makeJob } from '../../helpers/factories';
import { BLOCKING_TEXTS } from '../../helpers/fixtures';

describe('checkEligibility — escopo INTERNATIONAL', () => {
  const config = makeConfig();
  const intlJob = makeJob({ scope: 'INTERNATIONAL' });

  it.each([
    ['US Citizens Only', BLOCKING_TEXTS.usCitizens],
    ['W2 only', BLOCKING_TEXTS.w2Only],
    ['Security Clearance', BLOCKING_TEXTS.clearance],
    ['patrocínio de visto indisponível', BLOCKING_TEXTS.visaUnavailable],
  ])('bloqueia vaga com exigência: %s', (_label, text) => {
    // feature/08: Restrições eliminatórias internacionais bloqueadas
    const result = checkEligibility({ ...intlJob, descriptionMarkdown: text }, config);

    expect(result.eligible).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('aprova vaga remota compatível com LATAM e contrato B2B', () => {
    // feature/08: priorizar vagas com LATAM/Async/Contractor
    const result = checkEligibility(
      { ...intlJob, descriptionMarkdown: BLOCKING_TEXTS.latamFriendly },
      config,
    );

    expect(result.eligible).toBe(true);
  });

  it('não bloqueia exigência de visto quando blockVisaRequired está desligado', () => {
    const relaxed = makeConfig({
      marketScope: {
        ...config.marketScope,
        international: { ...config.marketScope.international, blockVisaRequired: false },
      },
    });

    const result = checkEligibility(
      { ...intlJob, descriptionMarkdown: BLOCKING_TEXTS.usCitizens },
      relaxed,
    );

    expect(result.eligible).toBe(true);
  });

  it('marca para revisão vaga sem região nem modelo de trabalho declarados', () => {
    // DECISOES.md sugestão #6: elegível com flag de revisão
    const result = checkEligibility(
      { ...intlJob, descriptionMarkdown: 'Great engineer wanted. TypeScript a plus.' },
      config,
    );

    expect(result.eligible).toBe(true);
    expect(result.needsReview).toBe(true);
  });
});

describe('checkEligibility — escopo NATIONAL', () => {
  const config = makeConfig();
  const natJob = makeJob({
    scope: 'NATIONAL',
    descriptionMarkdown: 'Vaga remota, contratação PJ, Brasil.',
  });

  it('aprova vaga remota nacional com contrato aceito (PJ/CLT)', () => {
    // feature/08: Validar modelo de contratação no escopo nacional
    const result = checkEligibility(natJob, config);
    expect(result.eligible).toBe(true);
  });

  it('rejeita vaga nacional com modelo de contratação não listado', () => {
    const result = checkEligibility(
      { ...natJob, descriptionMarkdown: 'Contratação Cooperado, remoto.' },
      config,
    );

    expect(result.eligible).toBe(false);
  });

  it('rejeita vaga híbrida em cidade fora da lista permitida', () => {
    // feature/08: Validar cidade permitida para vaga híbrida nacional
    const result = checkEligibility(
      { ...natJob, descriptionMarkdown: 'Modelo híbrido em São Paulo, 3x por semana. CLT.' },
      config,
    );

    expect(result.eligible).toBe(false);
  });

  it('aceita vaga híbrida em cidade permitida', () => {
    const result = checkEligibility(
      { ...natJob, descriptionMarkdown: 'Modelo híbrido em Recife, 2x por semana. CLT.' },
      config,
    );

    expect(result.eligible).toBe(true);
  });
});
