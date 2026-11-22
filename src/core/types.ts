import type { SalaryByLevel } from '../intake/masterProfile';

/** Forma mínima do perfil-mestre usada pelo pipeline e pelo matcher. */
export interface MasterProfileLike {
  fullName: string;
  email: string;
  phone: string;
  linkedin: string;
  github: string;
  portfolio: string;
  coreStack: string[];
  seniorityYears: number;
  projects: Array<{ name: string; summary: string; metrics: string[] }>;
  blockedKeywords: string[];
  standardAnswers: Record<string, string>;
  salaryExpectationBRL: number;
  salaryExpectationUSD: number;
  salaryByLevel?: SalaryByLevel;
}
