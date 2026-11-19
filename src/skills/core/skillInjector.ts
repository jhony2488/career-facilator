import fs from 'node:fs/promises';
import type { SkillMetadata } from './skillRegistry';

/**
 * Injeção otimizada no prompt (doc 05 §8.4): carrega o corpo do SKILL.md apenas
 * das skills selecionadas e remove o frontmatter para não desperdiçar tokens.
 */
export async function buildSkillsContextBlock(selectedSkills: SkillMetadata[]): Promise<string> {
  if (selectedSkills.length === 0) return '';

  const blocks = await Promise.all(
    selectedSkills.map(async (meta) => {
      const rawContent = await fs.readFile(meta.filePath, 'utf-8');
      const cleanInstructions = rawContent.replace(/^---[\s\S]*?---\r?\n?/, '').trim();
      return `### SKILL ATIVA: ${meta.name}\n${cleanInstructions}`;
    }),
  );

  return `\n<active_skills>\n${blocks.join('\n\n')}\n</active_skills>\n`;
}
