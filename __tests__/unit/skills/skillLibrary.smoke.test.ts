import { join } from 'node:path';
import { loadSkillRegistry } from '../../../src/skills/core/skillRegistry';
import { selectRelevantSkills } from '../../../src/skills/core/skillSelector';
import { buildSkillsContextBlock } from '../../../src/skills/core/skillInjector';

const LIB = join(__dirname, '../../../src/skills/library');

describe('skills/library — biblioteca real carrega e seleciona', () => {
  it('indexa as 3 skills do doc 05', async () => {
    const lib = await loadSkillRegistry(LIB);
    expect(lib.map((s) => s.id).sort()).toEqual(['ai-engineer', 'fullstack-ts', 'international-remote']);
    for (const s of lib) expect(s.triggers.length).toBeGreaterThan(3);
  });

  it('keywords de vaga TS remota USD ativam fullstack-ts + international-remote', async () => {
    const lib = await loadSkillRegistry(LIB);
    const selected = selectRelevantSkills(['TypeScript', 'Next.js', 'Remote USD'], lib);
    expect(selected.map((s) => s.id)).toEqual(['fullstack-ts', 'international-remote']);
  });

  it('keywords de IA ativam ai-engineer', async () => {
    const lib = await loadSkillRegistry(LIB);
    const selected = selectRelevantSkills(['LLM', 'RAG', 'LangChain'], lib);
    expect(selected[0]?.id).toBe('ai-engineer');
  });

  it('injeta corpo sem frontmatter', async () => {
    const lib = await loadSkillRegistry(LIB);
    const selected = selectRelevantSkills(['TypeScript', 'Node.js'], lib);
    const block = await buildSkillsContextBlock(selected);
    expect(block).toContain('<active_skills>');
    expect(block).toContain('Full-Stack TypeScript');
    expect(block).not.toContain('priority:');
  });
});
