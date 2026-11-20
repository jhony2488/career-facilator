import { selectRelevantSkills } from '../../../src/skills/core/skillSelector';
import type { SkillMetadata } from '../../helpers/contracts';
import { makeSkill } from '../../helpers/factories';

describe('selectRelevantSkills', () => {
  const fullstackTs = makeSkill({ id: 'fullstack-ts' });
  const intlRemote = makeSkill({
    id: 'international-remote',
    name: 'International Remote',
    triggers: ['remote', 'usd', 'latam', 'worldwide', 'b2b', 'contractor'],
    priority: 8,
  });
  const aiEngineer = makeSkill({
    id: 'ai-engineer',
    name: 'AI Engineer',
    triggers: ['rag', 'llm', 'agents', 'embeddings', 'python'],
    priority: 9,
  });
  const gupyAts = makeSkill({
    id: 'gupy-workday-ats',
    name: 'Gupy/Workday ATS',
    triggers: ['gupy', 'workday', 'taleo'],
    priority: 5,
  });
  const library = [fullstackTs, intlRemote, aiEngineer, gupyAts];

  it('activates skills whose triggers match the job keywords', () => {
    // feature/04: Activate skills whose triggers match the job keywords
    const selected = selectRelevantSkills(['TypeScript', 'Next.js', 'Remote USD'], library);

    expect(selected.map((s: SkillMetadata) => s.id)).toEqual([
      'fullstack-ts',
      'international-remote',
    ]);
  });

  it('is deterministic and requires no AI call', () => {
    // feature/04: selection with no AI call (pure function)
    const first = selectRelevantSkills(['typescript'], library);
    const second = selectRelevantSkills(['typescript'], library);
    expect(first).toEqual(second);
  });

  it('limits the number of activated skills to at most 2', () => {
    // feature/04: Limit the number of skills activated per job
    const selected = selectRelevantSkills(
      ['typescript', 'next.js', 'remote', 'usd', 'llm', 'rag', 'gupy'],
      library,
    );

    expect(selected.length).toBeLessThanOrEqual(2);
  });

  it('picks the highest scoring ones when there are more candidates than the limit', () => {
    // feature/04: the highest scoring ones are chosen
    const selected = selectRelevantSkills(
      ['typescript', 'next.js', 'node', 'postgresql', 'remote', 'llm'],
      library,
    );

    // fullstack-ts has 4+ hits — must be the first
    expect(selected[0].id).toBe('fullstack-ts');
  });

  it('uses skill priority as the tiebreaker for equal scores', () => {
    // feature/04: Skill priority breaks ties between equal trigger scores
    const skillA = makeSkill({ id: 'a', triggers: ['typescript'], priority: 1 });
    const skillB = makeSkill({ id: 'b', triggers: ['typescript'], priority: 10 });
    const skillC = makeSkill({ id: 'c', triggers: ['typescript'], priority: 5 });

    const selected = selectRelevantSkills(['typescript'], [skillA, skillB, skillC]);

    expect(selected.map((s: SkillMetadata) => s.id)).toEqual(['b', 'c']);
  });

  it('does case-insensitive partial matching between keywords and triggers', () => {
    const selected = selectRelevantSkills(['TYPESCRIPT ', ' next.js'], library);
    expect(selected.map((s: SkillMetadata) => s.id)).toContain('fullstack-ts');
  });

  it('returns an empty list when no triggers match', () => {
    // feature/04: No skill activated when no triggers match
    const selected = selectRelevantSkills(['cobol', 'mainframe'], library);
    expect(selected).toEqual([]);
  });
});
