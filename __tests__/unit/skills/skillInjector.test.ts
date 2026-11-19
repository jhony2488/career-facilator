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

  it('retorna string vazia quando nenhuma skill foi selecionada', () => {
    // feature/04: nenhum bloco de skills é injetado sem skills ativas
    return expect(buildSkillsContextBlock([])).resolves.toBe('');
  });

  it('inclui apenas o corpo das skills selecionadas no bloco', async () => {
    // feature/04: Injetar apenas o corpo das skills ativadas no contexto
    const block = await buildSkillsContextBlock([
      makeSkill({ filePath: skillPath }),
    ]);

    expect(block).toContain('<active_skills>');
    expect(block).toContain('</active_skills>');
    expect(block).toContain('Full-Stack TypeScript & SaaS Architect');
    expect(block).toContain('Resume Tailoring Guidelines');
  });

  it('remove o frontmatter YAML para não desperdiçar tokens', async () => {
    // feature/04: metadados internos de configuração não são enviados ao modelo
    const block = await buildSkillsContextBlock([
      makeSkill({ filePath: skillPath }),
    ]);

    expect(block).not.toContain('triggers:');
    expect(block).not.toContain('priority:');
    expect(block).not.toMatch(/^---/m);
  });

  it('funciona com skills sem frontmatter', async () => {
    const block = await buildSkillsContextBlock([
      makeSkill({ filePath: plainSkillPath }),
    ]);

    expect(block).toContain('Plain Instructions');
  });

  it('concatena múltiplas skills no mesmo bloco', async () => {
    const block = await buildSkillsContextBlock([
      makeSkill({ id: 'a', name: 'Skill A', filePath: skillPath }),
      makeSkill({ id: 'b', name: 'Skill B', filePath: plainSkillPath }),
    ]);

    expect(block).toContain('Skill A');
    expect(block).toContain('Skill B');
    expect(block.indexOf('Skill A')).toBeLessThan(block.indexOf('Skill B'));
  });
});
