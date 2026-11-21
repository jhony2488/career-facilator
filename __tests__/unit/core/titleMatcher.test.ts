import {
  matchTargetTitle,
  createSemanticTitleMatcher,
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
    expect(matchTargetTitle('Fullstack Developer', TARGETS)?.target).toBe('Full Stack Developer');
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

describe('createSemanticTitleMatcher', () => {
  const vec = (v: number[]): number[] => v;
  const embedder = (map: Record<string, number[]>) => ({
    embed: jest.fn(async (texts: string[]) => texts.map((t) => map[t] ?? [0])),
  });

  it('returns deterministic match without calling the embedder', async () => {
    const e = embedder({});
    const match = createSemanticTitleMatcher(TARGETS, e);
    expect(await match('Fullstack Developer')).toEqual({
      target: 'Full Stack Developer',
      strength: 'squashed',
    });
    expect(e.embed).not.toHaveBeenCalled();
  });

  it('falls back to semantic when deterministic finds nothing', async () => {
    // 'JS Developer' is orthogonal to all targets lexically
    const e = embedder({
      'JS Developer': vec([1, 0]),
      'Node.js Developer': vec([0.95, 0.31]),
      'Desenvolvedor Full Stack': vec([0, 1]),
      'Full Stack Developer': vec([0, 1]),
      'Backend Developer': vec([0.5, 0.5]),
    });
    const match = createSemanticTitleMatcher(TARGETS, e);
    const m = await match('JS Developer');
    expect(m?.target).toBe('Node.js Developer');
    expect(m?.strength).toBe('semantic');
    expect(m?.score).toBeGreaterThanOrEqual(0.72);
  });

  it('returns deterministic result when cosine stays below threshold', async () => {
    const e = embedder({
      'Product Owner': vec([1, 0]),
      'Backend Developer': vec([0.1, 0.99]),
      'Desenvolvedor Full Stack': vec([0, 1]),
      'Full Stack Developer': vec([0, 1]),
      'Node.js Developer': vec([0.2, 0.98]),
    });
    const match = createSemanticTitleMatcher(TARGETS, e);
    expect(await match('Product Owner')).toBeNull();
  });

  it('caches target embeddings across calls', async () => {
    const e = embedder({
      'Unknown A': vec([0, 0]),
      'Unknown B': vec([0, 0]),
      'Backend Developer': vec([1, 0]),
    });
    const match = createSemanticTitleMatcher(['Backend Developer'], e);
    await match('Unknown A');
    await match('Unknown B');
    // 1 call for targets + 1 per job title � targets are not re-embedded
    expect(e.embed).toHaveBeenCalledTimes(3);
  });

  it('degrades to deterministic when the embedder throws', async () => {
    const failing = {
      embed: jest.fn(async () => {
        throw new Error('offline');
      }),
    };
    const match = createSemanticTitleMatcher(TARGETS, failing);
    expect(await match('Backned Developer')).toEqual({
      target: 'Backend Developer',
      strength: 'levenshtein',
    });
  });

  it('works without an embedder (deterministic only)', async () => {
    const match = createSemanticTitleMatcher(TARGETS, undefined);
    expect(await match('Backend Dev')).not.toBeNull();
    expect(await match('Product Manager')).toBeNull();
  });
});
