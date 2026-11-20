import {
  matchTargetTitle,
  normalizeTitle,
  levenshtein,
} from '../../../src/core/titleMatcher';

const TARGETS = [
  'Desenvolvedor Full Stack',
  'Full Stack Developer',
  'Backend Developer',
  'Node.js Developer',
];

describe('matchTargetTitle', () => {
  it('matches exact titles case-insensitively', () => {
    const m = matchTargetTitle('full stack developer', TARGETS);
    expect(m?.target).toBe('Full Stack Developer');
    expect(m?.strength).toBe('exact');
  });

  it('matches glued words: "Fullstack Developer" ↔ "Full Stack Developer"', () => {
    expect(matchTargetTitle('Fullstack Developer', TARGETS)?.target).toBe(
      'Full Stack Developer',
    );
  });

  it('matches hyphenated variants: "Full-Stack Developer"', () => {
    expect(matchTargetTitle('Full-Stack Developer', TARGETS)).not.toBeNull();
  });

  it('matches PT ↔ PT glued: "Desenvolvedor Fullstack"', () => {
    expect(matchTargetTitle('Desenvolvedor Fullstack', TARGETS)?.target).toBe(
      'Desenvolvedor Full Stack',
    );
  });

  it('matches titles with suffix/prefix noise: "Senior Full Stack Developer (Remote)"', () => {
    expect(matchTargetTitle('Senior Full Stack Developer (Remote)', TARGETS)).not.toBeNull();
  });

  it('matches small typos (proportional Levenshtein): "Backned Developer"', () => {
    expect(matchTargetTitle('Backned Developer', TARGETS)?.target).toBe('Backend Developer');
  });

  it('matches token reordering: "Developer, Backend"', () => {
    const m = matchTargetTitle('Developer, Backend', TARGETS);
    expect(m?.target).toBe('Backend Developer');
  });

  it('matches "Node.js Developer" despite punctuation', () => {
    expect(matchTargetTitle('nodejs developer', TARGETS)?.target).toBe('Node.js Developer');
  });

  it('matches canonical aliases: "Backend Engineer" → "Backend Developer"', () => {
    const m = matchTargetTitle('Backend Engineer', TARGETS);
    expect(m?.target).toBe('Backend Developer');
  });

  it('matches alias + reordering: "Dev Backend"', () => {
    const m = matchTargetTitle('Dev Backend', TARGETS);
    expect(m?.target).toBe('Backend Developer');
  });

  it('matches PT↔EN aliases: "Engenheiro Backend" → "Backend Developer"', () => {
    const m = matchTargetTitle('Engenheiro Backend', TARGETS);
    expect(m?.target).toBe('Backend Developer');
  });

  it('does NOT match the other end of the stack: "Frontend Developer" vs "Backend Developer"', () => {
    // distinctive token 'backend' is absent from the job title
    const m = matchTargetTitle('Frontend Developer', ['Backend Developer']);
    expect(m).toBeNull();
  });

  it('does NOT let a short title match via Levenshtein: "Dev" is too short', () => {
    expect(matchTargetTitle('Dev', ['DevOps'])).toBeNull();
  });

  it('strips accents when normalizing', () => {
    expect(normalizeTitle('Développeur Sênior')).toBe('developpeur senior');
  });

  it('does not match unrelated titles', () => {
    expect(matchTargetTitle('Product Manager', TARGETS)).toBeNull();
    expect(matchTargetTitle('Data Scientist', TARGETS)).toBeNull();
  });

  it('returns null for empty inputs', () => {
    expect(matchTargetTitle('', TARGETS)).toBeNull();
    expect(matchTargetTitle('Backend Developer', [])).toBeNull();
  });
});

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('fullstack', 'fullstack')).toBe(0);
  });

  it('counts small typo distances', () => {
    expect(levenshtein('fullmstack', 'fullstack')).toBe(1);
    expect(levenshtein('backned', 'backend')).toBe(2);
  });

  it('bails early on large length differences', () => {
    expect(levenshtein('dev', 'seniorsoftwareengineer')).toBe(99);
  });
});
