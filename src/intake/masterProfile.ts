import type { ExtractedProfile } from './profileStructurer';

export interface SalaryByLevelEntry {
  brl: number;
  usd: number;
}

export interface SalaryByLevel {
  JUNIOR: SalaryByLevelEntry;
  PLENO: SalaryByLevelEntry;
  SENIOR: SalaryByLevelEntry;
}

/**
 * Perfil-mestre aprovado — mesma forma do ExtractedProfile, mas os campos
 * numéricos são sempre definidos (ausentes viram 0 na compilação do MD).
 */
export interface MasterProfile extends Omit<
  ExtractedProfile,
  'seniorityYears' | 'salaryExpectationBRL' | 'salaryExpectationUSD' | 'salaryByLevel'
> {
  seniorityYears: number;
  salaryExpectationBRL: number;
  salaryExpectationUSD: number;
  salaryByLevel?: SalaryByLevel;
}
