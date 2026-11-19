import type { CareerOpsConfig, MarketScope } from '../config/careerOps.config';

export interface LocaleDecision {
  resumeLanguage: 'pt-BR' | 'en-US';
  currency: 'BRL' | 'USD';
  salaryExpectation: number;
}

/** Alterna idioma do CV e moeda da pretensão conforme o mercado (feature/08). */
export function resolveLocale(scope: MarketScope, config: CareerOpsConfig): LocaleDecision {
  if (scope === 'INTERNATIONAL') {
    return {
      resumeLanguage: 'en-US',
      currency: 'USD',
      salaryExpectation: config.marketScope.international.salaryExpectationUSD,
    };
  }
  return {
    resumeLanguage: 'pt-BR',
    currency: 'BRL',
    salaryExpectation: config.marketScope.national.salaryExpectationBRL,
  };
}
