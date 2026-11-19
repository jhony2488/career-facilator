import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export interface SkillMetadata {
  id: string;
  name: string;
  triggers: string[];
  priority: number;
  filePath: string;
}

export interface LoadedSkill extends SkillMetadata {
  body: string; // corpo do SKILL.md sem frontmatter
}

/** Extrai frontmatter YAML simples (id, name, triggers, priority) do SKILL.md. */
export function parseSkillFrontmatter(raw: string): { meta: Omit<SkillMetadata, 'filePath'>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { meta: { id: 'unknown', name: 'unknown', triggers: [], priority: 0 }, body: raw.trim() };

  const yaml = match[1];
  const body = raw.slice(match[0].length).trim();

  const id = yaml.match(/^id:\s*(.+)$/m)?.[1]?.trim() ?? 'unknown';
  const name = yaml.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? id;
  const priority = Number(yaml.match(/^priority:\s*(\d+)$/m)?.[1] ?? 0);
  const triggersBlock = yaml.match(/^triggers:\s*\[(.*)\]$/m)?.[1] ?? '';
  const triggers = triggersBlock
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  return { meta: { id, name, triggers, priority }, body };
}

/** Indexa os SKILL.md da biblioteca extraindo só metadados leves (doc 05 §8.1). */
export async function loadSkillRegistry(libraryDir: string): Promise<SkillMetadata[]> {
  const entries = await fs.readdir(libraryDir, { withFileTypes: true });
  const skills: SkillMetadata[] = [];

  for (const entry of entries.filter((e) => e.isDirectory())) {
    const skillPath = join(libraryDir, entry.name, 'SKILL.md');
    try {
      const raw = await fs.readFile(skillPath, 'utf-8');
      const { meta } = parseSkillFrontmatter(raw);
      skills.push({ ...meta, filePath: skillPath });
    } catch {
      // diretório sem SKILL.md — ignora
    }
  }
  return skills;
}
