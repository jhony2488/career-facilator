import type { SkillMetadata } from './skillRegistry';

/**
 * Seleção determinística de skills (doc 05 §8.4) — custo zero de IA.
 * Cruza matchedKeywords da triagem com triggers das skills; desempate por prioridade.
 */
export function selectRelevantSkills(
  matchedKeywords: string[],
  availableSkills: SkillMetadata[],
  maxSkills = 2,
): SkillMetadata[] {
  const normalizedKeywords = matchedKeywords.map((k) => k.toLowerCase().trim());

  const scored = availableSkills
    .map((skill) => {
      const hits = skill.triggers.filter((trigger) =>
        normalizedKeywords.some((kw) => kw.includes(trigger) || trigger.includes(kw)),
      ).length;

      return { skill, score: hits * 10 + skill.priority, hits };
    })
    .filter((item) => item.hits > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, maxSkills).map((item) => item.skill);
}
