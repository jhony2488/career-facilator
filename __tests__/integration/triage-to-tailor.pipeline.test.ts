import { triageJob } from '../../src/ai/triageAgent';
import { selectRelevantSkills } from '../../src/skills/core/skillSelector';
import { buildSkillsContextBlock } from '../../src/skills/core/skillInjector';
import { tailorResume } from '../../src/ai/tailorerAgent';
import { makeJob, makeMasterProfile, makeSkill } from '../helpers/factories';
import { mockTriageModel, mockTailorModel } from '../helpers/mocks';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SAMPLE_SKILL_MD, INTL_JOB_DESCRIPTION } from '../helpers/fixtures';

describe('Pipeline: TRIAGED → skills → TAILORED', () => {
  let skillPath: string;

  beforeAll(async () => {
    skillPath = join(tmpdir(), `skill-it-${Date.now()}.md`);
    await fs.writeFile(skillPath, SAMPLE_SKILL_MD, 'utf-8');
  });

  afterAll(async () => {
    await fs.rm(skillPath, { force: true });
  });

  it('encadeia triagem → seleção de skills → geração de currículo', async () => {
    // features 03 + 04 + 05: fluxo completo de uma vaga aprovada
    const profile = makeMasterProfile();
    const job = makeJob({ descriptionMarkdown: INTL_JOB_DESCRIPTION });

    // 1. Triagem (Camada 1 — modelo leve mockado)
    const triageModel = mockTriageModel({ fitScore: 85, matchedKeywords: ['TypeScript', 'Next.js', 'Remote USD'] });
    const triage = await triageJob({ jobText: job.descriptionMarkdown, profile }, { model: triageModel });
    expect(triage.fitScore).toBeGreaterThanOrEqual(75);

    // 2. Skills — seleção determinística (0 tokens)
    const skills = selectRelevantSkills(triage.matchedKeywords, [
      makeSkill({ filePath: skillPath }),
      makeSkill({ id: 'international-remote', triggers: ['remote', 'usd', 'worldwide'], priority: 8, filePath: skillPath }),
    ]);
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.length).toBeLessThanOrEqual(2);

    // 3. Injeção de contexto enxuto
    const skillsBlock = await buildSkillsContextBlock(skills);
    expect(skillsBlock).toContain('<active_skills>');

    // 4. Geração (Camada 2 — modelo smart mockado)
    const tailorModel = mockTailorModel();
    const assets = await tailorResume(
      { job, triage, skillsBlock, profile },
      { model: tailorModel },
    );

    expect(assets.resumeMarkdown).toContain('Dev Tester');
    expect(tailorModel.tailor).toHaveBeenCalled();
  });

  it('reusa o perfil em cache na segunda vaga processada', async () => {
    // feature/05: Reutilizar o perfil mestre em cache ao processar vagas em lote
    const tailorModel = mockTailorModel();
    const profile = makeMasterProfile();
    const job = makeJob();

    await tailorResume({ job, triage: {}, skillsBlock: '', profile }, { model: tailorModel });
    await tailorResume({ job: { ...job, id: 'job-002' }, triage: {}, skillsBlock: '', profile }, { model: tailorModel });

    const [first, second] = tailorModel.calls;
    expect(second.cachedProfileTokens).toBeLessThan(first.cachedProfileTokens);
  });
});
