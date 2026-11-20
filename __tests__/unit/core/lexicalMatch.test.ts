import {
  computeLexicalFit,
  profileFitTerms,
} from '../../../src/core/lexicalMatch';
import { makeMasterProfile } from '../../helpers/factories';

const profile = makeMasterProfile({
  coreStack: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
  experiences: [{ role: 'Senior Fullstack Engineer', company: 'X', period: '2020', highlights: [] }],
  projects: [{ name: 'JobSearch CLI', summary: '', metrics: [] }],
});

describe('profileFitTerms', () => {
  it('extracts stack + terms from titles ≥4 letters long', () => {
    const terms = profileFitTerms(profile);
    for (const t of ['typescript', 'react', 'node.js', 'postgresql', 'senior', 'fullstack', 'jobsearch']) {
      expect(terms).toContain(t);
    }
    expect(terms).not.toContain('engineer'.slice(0, 3));
  });
});

describe('computeLexicalFit', () => {
  const terms = ['typescript', 'react', 'node.js', 'postgresql'];

  it('matches exact terms and counts hits', () => {
    const fit = computeLexicalFit(
      'Procuramos dev TypeScript com React e TypeScript novamente',
      terms,
    );
    expect(fit.matchedTerms).toEqual(expect.arrayContaining(['typescript', 'react']));
    expect(fit.coverage).toBeCloseTo(0.5);
    expect(fit.hits).toBeGreaterThanOrEqual(3); // typescript×2 + react×1
  });

  it('case-insensitive', () => {
    const fit = computeLexicalFit('TYPESCRIPT developer', terms);
    expect(fit.matchedTerms).toContain('typescript');
  });

  it('no overlap → coverage 0 and empty matchedTerms', () => {
    const fit = computeLexicalFit('Analista de COBOL com experiência em mainframe', terms);
    expect(fit.matchedTerms).toHaveLength(0);
    expect(fit.coverage).toBe(0);
  });

  it('empty term list → coverage 0 without crashing', () => {
    expect(computeLexicalFit('qualquer vaga', []).coverage).toBe(0);
  });
});
