import { resolveLocale } from '../../../src/geo/localeAdapter';
import { makeConfig } from '../../helpers/factories';

describe('resolveLocale — idioma e moeda por escopo', () => {
  const config = makeConfig();

  it('resolve PT-BR e BRL para o escopo NATIONAL', () => {
    // feature/08: Pretensão salarial preenchida conforme o mercado (BRL)
    const locale = resolveLocale('NATIONAL', config);

    expect(locale.resumeLanguage).toBe('pt-BR');
    expect(locale.currency).toBe('BRL');
    expect(locale.salaryExpectation).toBe(config.marketScope.national.salaryExpectationBRL);
  });

  it('resolve EN-US e USD para o escopo INTERNATIONAL', () => {
    // feature/08: escopo internacional adapta CV para inglês e USD
    const locale = resolveLocale('INTERNATIONAL', config);

    expect(locale.resumeLanguage).toBe('en-US');
    expect(locale.currency).toBe('USD');
    expect(locale.salaryExpectation).toBe(config.marketScope.international.salaryExpectationUSD);
  });
});
