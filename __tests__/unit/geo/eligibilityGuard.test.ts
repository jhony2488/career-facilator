import { checkEligibility } from '../../../src/geo/eligibilityGuard';
import { makeConfig, makeJob } from '../../helpers/factories';
import { BLOCKING_TEXTS } from '../../helpers/fixtures';

describe('checkEligibility — INTERNATIONAL scope', () => {
  const config = makeConfig();
  const intlJob = makeJob({ scope: 'INTERNATIONAL' });

  it.each([
    ['US Citizens Only', BLOCKING_TEXTS.usCitizens],
    ['W2 only', BLOCKING_TEXTS.w2Only],
    ['Security Clearance', BLOCKING_TEXTS.clearance],
    ['visa sponsorship unavailable', BLOCKING_TEXTS.visaUnavailable],
  ])('blocks job with requirement: %s', (_label, text) => {
    // feature/08: International eliminatory restrictions are blocked
    const result = checkEligibility({ ...intlJob, descriptionMarkdown: text }, config);

    expect(result.eligible).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('approves a remote job compatible with LATAM and B2B contract', () => {
    // feature/08: prioritize jobs with LATAM/Async/Contractor
    const result = checkEligibility(
      { ...intlJob, descriptionMarkdown: BLOCKING_TEXTS.latamFriendly },
      config,
    );

    expect(result.eligible).toBe(true);
  });

  it('does not block a visa requirement when blockVisaRequired is off', () => {
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

  it('flags for review a job with no declared region or work model', () => {
    // DECISOES.md suggestion #6: eligible with a review flag
    const result = checkEligibility(
      { ...intlJob, descriptionMarkdown: 'Great engineer wanted. TypeScript a plus.' },
      config,
    );

    expect(result.eligible).toBe(true);
    expect(result.needsReview).toBe(true);
  });
});

describe('checkEligibility — NATIONAL scope', () => {
  const config = makeConfig();
  const natJob = makeJob({
    scope: 'NATIONAL',
    descriptionMarkdown: 'Vaga remota, contratação PJ, Brasil.',
  });

  it('approves a national remote job with an accepted contract type (PJ/CLT)', () => {
    // feature/08: Validate the contract type under the national scope
    const result = checkEligibility(natJob, config);
    expect(result.eligible).toBe(true);
  });

  it('rejects a national job with an unlisted contract type', () => {
    const result = checkEligibility(
      { ...natJob, descriptionMarkdown: 'Contratação Cooperado, remoto.' },
      config,
    );

    expect(result.eligible).toBe(false);
  });

  it('rejects a hybrid job in a city outside the allowed list', () => {
    // feature/08: Validate the allowed city for a national hybrid job
    const result = checkEligibility(
      { ...natJob, descriptionMarkdown: 'Modelo híbrido em São Paulo, 3x por semana. CLT.' },
      config,
    );

    expect(result.eligible).toBe(false);
  });

  it('accepts a hybrid job in an allowed city', () => {
    const result = checkEligibility(
      { ...natJob, descriptionMarkdown: 'Modelo híbrido em Recife, 2x por semana. CLT.' },
      config,
    );

    expect(result.eligible).toBe(true);
  });
});

describe('checkEligibility — marketScope.target gate (MARKET_SCOPE)', () => {
  const config = makeConfig();
  const withTarget = (target: 'NATIONAL' | 'INTERNATIONAL' | 'BOTH') =>
    makeConfig({ marketScope: { ...config.marketScope, target } });

  // decisão #45: vaga detectada no escopo desligado é recusada antes de tudo
  it('rejects an international job when target is NATIONAL', () => {
    const result = checkEligibility(
      { ...makeJob({ scope: 'INTERNATIONAL' }), descriptionMarkdown: 'Great remote role.' },
      withTarget('NATIONAL'),
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('MARKET_SCOPE');
  });

  it('rejects a national job when target is INTERNATIONAL', () => {
    const result = checkEligibility(
      { ...makeJob({ scope: 'NATIONAL' }), descriptionMarkdown: 'Vaga remota, CLT.' },
      withTarget('INTERNATIONAL'),
    );
    expect(result.eligible).toBe(false);
  });

  it('keeps national jobs eligible when target is NATIONAL', () => {
    const result = checkEligibility(
      { ...makeJob({ scope: 'NATIONAL' }), descriptionMarkdown: 'Vaga remota, contratação PJ.' },
      withTarget('NATIONAL'),
    );
    expect(result.eligible).toBe(true);
  });

  it('an undetermined-scope job does not fall back to international under NATIONAL', () => {
    // texto sem pistas BR: nacional inelegível → não tenta o caminho internacional
    const result = checkEligibility(
      { ...makeJob({ scope: 'BOTH' }), descriptionMarkdown: '100% onsite, contractor only.' },
      withTarget('NATIONAL'),
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).not.toContain('MARKET_SCOPE'); // recusado pela regra nacional
  });
});
