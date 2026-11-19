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

  it('ativa skills cujos triggers coincidem com as palavras-chave da vaga', () => {
    // feature/04: Ativar skills cujos gatilhos coincidem com as palavras-chave da vaga
    const selected = selectRelevantSkills(
      ['TypeScript', 'Next.js', 'Remote USD'],
      library,
    );

    expect(selected.map((s: SkillMetadata) => s.id)).toEqual(['fullstack-ts', 'international-remote']);
  });

  it('é determinística e não exige chamada de IA', () => {
    // feature/04: seleção sem nenhuma chamada de IA (função pura)
    const first = selectRelevantSkills(['typescript'], library);
    const second = selectRelevantSkills(['typescript'], library);
    expect(first).toEqual(second);
  });

  it('limita a quantidade de skills ativadas a no máximo 2', () => {
    // feature/04: Limitar a quantidade de skills ativadas por vaga
    const selected = selectRelevantSkills(
      ['typescript', 'next.js', 'remote', 'usd', 'llm', 'rag', 'gupy'],
      library,
    );

    expect(selected.length).toBeLessThanOrEqual(2);
  });

  it('escolhe as mais bem pontuadas quando há mais candidatas que o limite', () => {
    // feature/04: as mais bem pontuadas são escolhidas
    const selected = selectRelevantSkills(
      ['typescript', 'next.js', 'node', 'postgresql', 'remote', 'llm'],
      library,
    );

    // fullstack-ts tem 4+ hits — deve ser a primeira
    expect(selected[0].id).toBe('fullstack-ts');
  });

  it('usa a prioridade da skill como desempate de pontuação igual', () => {
    // feature/04: Prioridade da skill desempata pontuações iguais de gatilhos
    const skillA = makeSkill({ id: 'a', triggers: ['typescript'], priority: 1 });
    const skillB = makeSkill({ id: 'b', triggers: ['typescript'], priority: 10 });
    const skillC = makeSkill({ id: 'c', triggers: ['typescript'], priority: 5 });

    const selected = selectRelevantSkills(['typescript'], [skillA, skillB, skillC]);

    expect(selected.map((s: SkillMetadata) => s.id)).toEqual(['b', 'c']);
  });

  it('faz matching case-insensitive e parcial entre keywords e triggers', () => {
    const selected = selectRelevantSkills(['TYPESCRIPT ', ' next.js'], library);
    expect(selected.map((s: SkillMetadata) => s.id)).toContain('fullstack-ts');
  });

  it('retorna lista vazia quando não há coincidência de triggers', () => {
    // feature/04: Nenhuma skill ativada quando não há coincidência de gatilhos
    const selected = selectRelevantSkills(['cobol', 'mainframe'], library);
    expect(selected).toEqual([]);
  });
});
