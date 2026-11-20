import { resolveLocale } from '../../../src/geo/localeAdapter';
import { makeConfig } from '../../helpers/factories';

describe('resolveLocale — language and currency per scope', () => {
  const config = makeConfig();

  it('resolves PT-BR and BRL for the NATIONAL scope', () => {
    // feature/08: Salary expectation filled according to the market (BRL)
    const locale = resolveLocale('NATIONAL', config);

    expect(locale.resumeLanguage).toBe('pt-BR');
    expect(locale.currency).toBe('BRL');
    expect(locale.salaryExpectation).toBe(config.marketScope.national.salaryExpectationBRL);
  });

  it('resolves EN-US and USD for the INTERNATIONAL scope', () => {
    // feature/08: the international scope adapts the resume to English and USD
    const locale = resolveLocale('INTERNATIONAL', config);

    expect(locale.resumeLanguage).toBe('en-US');
    expect(locale.currency).toBe('USD');
    expect(locale.salaryExpectation).toBe(config.marketScope.international.salaryExpectationUSD);
  });
});
