import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSkillsContextBlock } from '../../../src/skills/core/skillInjector';
import { makeSkill } from '../../helpers/factories';
import { SAMPLE_SKILL_MD, SAMPLE_SKILL_NO_FRONTMATTER } from '../../helpers/fixtures';

describe('buildSkillsContextBlock', () => {
  let skillPath: string;
  let plainSkillPath: string;

  beforeAll(async () => {
    skillPath = join(tmpdir(), `skill-${Date.now()}.md`);
    plainSkillPath = join(tmpdir(), `skill-plain-${Date.now()}.md`);
    await fs.writeFile(skillPath, SAMPLE_SKILL_MD, 'utf-8');
    await fs.writeFile(plainSkillPath, SAMPLE_SKILL_NO_FRONTMATTER, 'utf-8');
  });

  afterAll(async () => {
    await fs.rm(skillPath, { force: true });
    await fs.rm(plainSkillPath, { force: true });
  });

  it('returns an empty string when no skill was selected', () => {
    // feature/04: no skills block is injected without active skills
    return expect(buildSkillsContextBlock([])).resolves.toBe('');
  });

  it('includes only the body of the selected skills in the block', async () => {
    // feature/04: Inject only the body of the activated skills into the context
    const block = await buildSkillsContextBlock([makeSkill({ filePath: skillPath })]);

    expect(block).toContain('<active_skills>');
    expect(block).toContain('</active_skills>');
    expect(block).toContain('Full-Stack TypeScript & SaaS Architect');
    expect(block).toContain('Resume Tailoring Guidelines');
  });

  it('strips the YAML frontmatter to avoid wasting tokens', async () => {
    // feature/04: internal configuration metadata is not sent to the model
    const block = await buildSkillsContextBlock([makeSkill({ filePath: skillPath })]);

    expect(block).not.toContain('triggers:');
    expect(block).not.toContain('priority:');
    expect(block).not.toMatch(/^---/m);
  });

  it('works with skills without frontmatter', async () => {
    const block = await buildSkillsContextBlock([makeSkill({ filePath: plainSkillPath })]);

    expect(block).toContain('Plain Instructions');
  });

  it('concatenates multiple skills into the same block', async () => {
    const block = await buildSkillsContextBlock([
      makeSkill({ id: 'a', name: 'Skill A', filePath: skillPath }),
      makeSkill({ id: 'b', name: 'Skill B', filePath: plainSkillPath }),
    ]);

    expect(block).toContain('Skill A');
    expect(block).toContain('Skill B');
    expect(block.indexOf('Skill A')).toBeLessThan(block.indexOf('Skill B'));
  });
});
