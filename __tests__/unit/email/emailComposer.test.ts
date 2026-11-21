import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { composeEmail } from '../../../src/email_application/emailComposer';
import { makeMasterProfile, makeSkill } from '../../helpers/factories';

const LOCALE_BR = {
  resumeLanguage: 'pt-BR' as const,
  currency: 'BRL' as const,
  salaryExpectation: 10000,
};
const LOCALE_US = {
  resumeLanguage: 'en-US' as const,
  currency: 'USD' as const,
  salaryExpectation: 4500,
};

describe('composeEmail — preferred body template + salary expectation (docs 11/14)', () => {
  const base = {
    job: { title: 'Dev Sr', company: 'TechCorp' },
    recipient: { email: 'careers@techcorp.io' },
    profile: makeMasterProfile(),
    skills: [makeSkill()],
    resumePath: 'storage/generated_resumes/job-1.pdf',
  };

  it('renders the built-in pt-BR template with links and salary line', async () => {
    const draft = await composeEmail({ ...base, locale: LOCALE_BR });

    expect(draft.body).toContain('Bom dia');
    expect(draft.body).toContain('LinkedIn: https://linkedin.com/in/devtester');
    expect(draft.body).toContain('GitHub: https://github.com/devtester');
    expect(draft.body).toMatch(/Pretensão salarial: R\$\s?10\.000/);
    expect(draft.subject).toBe('Candidatura — Dev Sr | Dev Tester');
    expect(draft.fitScore).toBeUndefined();
  });

  it('omits the salary line when includeSalaryExpectation is false', async () => {
    const draft = await composeEmail({
      ...base,
      locale: LOCALE_BR,
      includeSalaryExpectation: false,
    });
    expect(draft.body).not.toContain('Pretensão salarial');
  });

  it('renders the en-US variant with USD salary', async () => {
    const draft = await composeEmail({ ...base, locale: LOCALE_US });
    expect(draft.body).toContain('Good morning');
    expect(draft.body).toMatch(/Salary expectation: \$4,500/);
    expect(draft.subject).toBe('Application — Dev Sr | Dev Tester');
  });

  it('uses a custom template file when bodyTemplatePath is provided', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'career-tpl-'));
    try {
      const tpl = join(dir, 'my.md');
      writeFileSync(tpl, 'Candidato {{fullName}} para {{jobTitle}}.\n', 'utf-8');
      const draft = await composeEmail({ ...base, locale: LOCALE_BR, bodyTemplatePath: tpl });
      expect(draft.body).toBe('Candidato Dev Tester para Dev Sr.');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('propagates fitScore to the draft for hybrid dispatch gating', async () => {
    const draft = await composeEmail({ ...base, locale: LOCALE_US, fitScore: 92 });
    expect(draft.fitScore).toBe(92);
  });
});
