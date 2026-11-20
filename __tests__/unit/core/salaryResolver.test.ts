import {
  detectSeniorityLevel,
  parseSalaryRange,
  resolveSalaryExpectation,
} from '../../../src/core/salaryResolver';
import { makeConfig } from '../../helpers/factories';

describe('detectSeniorityLevel', () => {
  it('detects senior from title variants', () => {
    expect(detectSeniorityLevel('Senior Backend Engineer')).toBe('SENIOR');
    expect(detectSeniorityLevel('Desenvolvedor Sênior Node')).toBe('SENIOR');
    expect(detectSeniorityLevel('Staff Software Engineer')).toBe('SENIOR');
    expect(detectSeniorityLevel('Tech Lead Full Stack')).toBe('SENIOR');
  });

  it('detects pleno and junior', () => {
    expect(detectSeniorityLevel('Desenvolvedor Pleno React')).toBe('PLENO');
    expect(detectSeniorityLevel('Mid-Level Frontend Dev')).toBe('PLENO');
    expect(detectSeniorityLevel('Junior Web Developer')).toBe('JUNIOR');
    expect(detectSeniorityLevel('Dev Júnior Node.js')).toBe('JUNIOR');
  });

  it('returns null when the level is not stated', () => {
    expect(detectSeniorityLevel('Full Stack Developer')).toBeNull();
  });
});

describe('parseSalaryRange', () => {
  it('parses BRL ranges with thousand separators', () => {
    const r = parseSalaryRange('Salário: R$ 8.000 a R$ 12.000 CLT', 'BRL');
    expect(r).toEqual({ min: 8000, max: 12000, currency: 'BRL' });
  });

  it('parses single BRL value as a degenerate range', () => {
    expect(parseSalaryRange('Oferecemos R$ 9.500 PJ', 'BRL')).toEqual({
      min: 9500,
      max: 9500,
      currency: 'BRL',
    });
  });

  it('parses USD ranges with k notation', () => {
    const r = parseSalaryRange('Salary: $5k - $7k per month', 'USD');
    expect(r).toEqual({ min: 5000, max: 7000, currency: 'USD' });
  });

  it('ignores values from the other currency and noise', () => {
    expect(parseSalaryRange('R$ 50 de vale + salary $6k', 'BRL')).toBeNull();
    expect(parseSalaryRange('R$ 50 de vale + salary $6k', 'USD')).toEqual({
      min: 6000,
      max: 6000,
      currency: 'USD',
    });
  });

  it('returns null when no salary is mentioned', () => {
    expect(parseSalaryRange('Great remote role, apply now', 'USD')).toBeNull();
  });
});

describe('resolveSalaryExpectation', () => {
  const config = makeConfig();

  it('uses the level-based expectation when the level is detected', () => {
    const r = resolveSalaryExpectation(
      { jobTitle: 'Senior Backend Engineer', jobText: 'remote role', currency: 'USD' },
      config,
    );
    expect(r.value).toBe(7000);
    expect(r.level).toBe('SENIOR');
  });

  it('falls back to the market default when no level is stated', () => {
    const r = resolveSalaryExpectation(
      { jobTitle: 'Backend Developer', jobText: 'vaga remota', currency: 'BRL' },
      config,
    );
    expect(r.value).toBe(10000);
    expect(r.level).toBeNull();
  });

  it('caps the expectation at the job range ceiling when it pays less', () => {
    const r = resolveSalaryExpectation(
      {
        jobTitle: 'Senior Backend Engineer',
        jobText: 'Salary range: $4k - $5k USD',
        currency: 'USD',
      },
      config,
    );
    expect(r.value).toBe(5000);
    expect(r.adaptedToRange).toBe(true);
  });

  it('keeps the base expectation when it fits inside the job range', () => {
    const r = resolveSalaryExpectation(
      {
        jobTitle: 'Desenvolvedor Pleno',
        jobText: 'Salário: R$ 8.000 a R$ 15.000',
        currency: 'BRL',
      },
      config,
    );
    expect(r.value).toBe(10000);
    expect(r.adaptedToRange).toBe(false);
  });

  it('does not inflate when the range pays more than the expectation', () => {
    const r = resolveSalaryExpectation(
      {
        jobTitle: 'Junior Frontend Dev',
        jobText: 'R$ 8.000 - R$ 10.000',
        currency: 'BRL',
      },
      config,
    );
    expect(r.value).toBe(5000); // pretensão JUNIOR, não o piso da vaga
    expect(r.adaptedToRange).toBe(false);
  });

  it('ignores the range when adaptToJobRange is off', () => {
    const off = makeConfig({ salary: { ...makeConfig().salary, adaptToJobRange: false } });
    const r = resolveSalaryExpectation(
      {
        jobTitle: 'Senior Backend Engineer',
        jobText: '$4k - $5k',
        currency: 'USD',
      },
      off,
    );
    expect(r.value).toBe(7000);
  });
});
