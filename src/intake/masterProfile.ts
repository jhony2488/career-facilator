import type { ExtractedProfile } from './profileStructurer';

/**
 * Perfil-mestre aprovado — mesma forma do ExtractedProfile, mas os campos
 * numéricos são sempre definidos (ausentes viram 0 na compilação do MD).
 */
export interface MasterProfile extends Omit<
  ExtractedProfile,
  'seniorityYears' | 'salaryExpectationBRL' | 'salaryExpectationUSD'
> {
  seniorityYears: number;
  salaryExpectationBRL: number;
  salaryExpectationUSD: number;
}
