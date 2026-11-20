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
