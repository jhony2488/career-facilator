import type { ExtractedProfile } from './profileStructurer';
import { NOT_INFORMED } from './profileStructurer';
import type { MasterProfile } from './masterProfile';
import type { ProfileConflict, FileStore, ProfileImportMode } from './types';

export interface ProfilePaths {
  draftPath: string;
  masterPath: string;
  historyDir: string;
}

export interface SaveDraftResult {
  draftPath: string;
  conflicts: ProfileConflict[];
}

export interface PromoteResult {
  activated: true;
  archivedTo?: string;
}

type AnyProfile = ExtractedProfile | MasterProfile;

type ScalarField =
  | 'fullName' | 'email' | 'phone' | 'linkedin' | 'github' | 'portfolio'
  | 'location' | 'summary';
type NumericField = 'seniorityYears' | 'salaryExpectationBRL' | 'salaryExpectationUSD';

/**
 * Store do perfil-mestre (doc 13 §13.3): rascunho → revisão humana → promoção.
 * Nada entra em vigor sem aprovação; a versão anterior é arquivada no histórico.
 */
export class MasterProfileStore {
  constructor(
    private readonly paths: ProfilePaths,
    private readonly deps: { fs: FileStore },
  ) {}

  async saveDraft(
    profile: ExtractedProfile,
    opts: { mode: ProfileImportMode; base?: MasterProfile },
  ): Promise<SaveDraftResult> {
    let merged: AnyProfile = profile;
    let conflicts: ProfileConflict[] = [];

    if (opts.mode === 'MERGE' && opts.base) {
      ({ merged, conflicts } = mergeProfiles(opts.base, profile));
    }

    await this.deps.fs.writeFile(this.paths.draftPath, profileToMarkdown(merged));
    return { draftPath: this.paths.draftPath, conflicts };
  }

  async getActiveProfileMarkdown(): Promise<string | null> {
    return this.deps.fs.readFile(this.paths.masterPath);
  }

  async getDraftMarkdown(): Promise<string | null> {
    return this.deps.fs.readFile(this.paths.draftPath);
  }

  /** Promove o rascunho a perfil ativo, arquivando a versão anterior. */
  async promoteDraft(): Promise<PromoteResult> {
    const draft = await this.deps.fs.readFile(this.paths.draftPath);
    if (draft === null) throw new Error('Nenhum rascunho pendente de aprovação.');

    let archivedTo: string | undefined;
    if (await this.deps.fs.exists(this.paths.masterPath)) {
      archivedTo = await this.deps.fs.archiveFile(this.paths.masterPath, this.paths.historyDir);
    }

    await this.deps.fs.writeFile(this.paths.masterPath, draft);
    return { activated: true, archivedTo };
  }
}

/**
 * Merge (doc 13 §13.2): soma dados novos sem apagar o existente; conflitos em
 * campos escalares são sinalizados para decisão do usuário — nunca resolvidos
 * sozinho.
 */
export function mergeProfiles(
  base: MasterProfile,
  incoming: ExtractedProfile,
): { merged: MasterProfile; conflicts: ProfileConflict[] } {
  const conflicts: ProfileConflict[] = [];

  const scalar = (key: ScalarField): string => {
    const inc = incoming[key];
    const cur = base[key];
    if (inc === NOT_INFORMED || inc === '') return cur;
    if (cur !== NOT_INFORMED && cur !== '' && cur !== inc) {
      conflicts.push({ field: key, existing: cur, incoming: inc });
      return cur;
    }
    return inc;
  };

  const numeric = (key: NumericField): number => {
    const inc = incoming[key];
    if (inc === null) return base[key];
    if (base[key] !== 0 && base[key] !== inc) {
      conflicts.push({ field: key, existing: String(base[key]), incoming: String(inc) });
      return base[key];
    }
    return inc;
  };

  const merged: MasterProfile = {
    fullName: scalar('fullName'),
    email: scalar('email'),
    phone: scalar('phone'),
    linkedin: scalar('linkedin'),
    github: scalar('github'),
    portfolio: scalar('portfolio'),
    location: scalar('location'),
    summary: scalar('summary'),
    seniorityYears: numeric('seniorityYears'),
    salaryExpectationBRL: numeric('salaryExpectationBRL'),
    salaryExpectationUSD: numeric('salaryExpectationUSD'),
    coreStack: mergeList(base.coreStack, incoming.coreStack),
    languages: mergeList(base.languages, incoming.languages),
    certifications: mergeList(base.certifications, incoming.certifications),
    blockedKeywords: mergeList(base.blockedKeywords, incoming.blockedKeywords),
    experiences: mergeBy(base.experiences, incoming.experiences, (e) => `${e.role}|${e.company}`),
    projects: mergeBy(base.projects, incoming.projects, (p) => p.name),
    openSourceProjects: mergeBy(
      base.openSourceProjects,
      incoming.openSourceProjects,
      (p) => p.repo || p.name,
    ),
    education: mergeBy(base.education, incoming.education, (e) => `${e.course}|${e.institution}`),
    standardAnswers: { ...incoming.standardAnswers, ...base.standardAnswers },
  };

  return { merged, conflicts };
}

function mergeList<T extends string>(base: T[], incoming: T[]): T[] {
  return [...new Set([...base, ...incoming])];
}

function mergeBy<T>(base: T[], incoming: T[], key: (item: T) => string): T[] {
  const seen = new Set(base.map(key));
  return [...base, ...incoming.filter((i) => !seen.has(key(i)))];
}

const fmt = (v: string) => (v === NOT_INFORMED || v === '' ? '_NÃO_INFORMADO_' : v);

/** Serializa o perfil no formato canônico do profile.master.md (doc 13 §13.4). */
export function profileToMarkdown(profile: AnyProfile): string {
  const salary =
    [
      profile.salaryExpectationBRL ? `R$ ${profile.salaryExpectationBRL}` : null,
      profile.salaryExpectationUSD ? `USD ${profile.salaryExpectationUSD}` : null,
    ]
      .filter(Boolean)
      .join(' | ') || '_NÃO_INFORMADO_';

  const experiences =
    profile.experiences
      .map(
        (e) =>
          `### ${e.role} — ${e.company} (${e.period})\n${e.highlights.map((h) => `- ${h}`).join('\n')}`,
      )
      .join('\n\n') || '_NÃO_INFORMADO_';

  const projects =
    profile.projects
      .map((p) => `### ${p.name}\n${p.summary}\n${p.metrics.map((m) => `- ${m}`).join('\n')}`)
      .join('\n\n') || '_NÃO_INFORMADO_';

  const oss =
    profile.openSourceProjects
      .map(
        (p) =>
          `### ${p.name}\n- Repo: ${p.repo}\n${p.summary}\n${p.metrics.map((m) => `- ${m}`).join('\n')}`,
      )
      .join('\n\n') || '_NÃO_INFORMADO_';

  const answers =
    Object.entries(profile.standardAnswers)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n') || '_NÃO_INFORMADO_';

  return [
    `# ${profile.fullName}`,
    '',
    '## Dados Pessoais',
    `- E-mail: ${fmt(profile.email)}`,
    `- Telefone: ${fmt(profile.phone)}`,
    `- LinkedIn: ${fmt(profile.linkedin)}`,
    `- GitHub: ${fmt(profile.github)}`,
    `- Portfólio: ${fmt(profile.portfolio)}`,
    `- Localização: ${fmt(profile.location)}`,
    `- Pretensão salarial: ${salary}`,
    '',
    '## Resumo',
    fmt(profile.summary),
    '',
    '## Experiências',
    experiences,
    '',
    '## Projetos',
    projects,
    '',
    '## Projetos Open Source',
    oss,
    '',
    '## Habilidades',
    `- Stacks: ${profile.coreStack.length ? profile.coreStack.join(', ') : '_NÃO_INFORMADO_'}`,
    `- Idiomas: ${profile.languages.length ? profile.languages.join(', ') : '_NÃO_INFORMADO_'}`,
    `- Certificações: ${profile.certifications.length ? profile.certifications.join(', ') : '_NÃO_INFORMADO_'}`,
    `- Anos de experiência: ${profile.seniorityYears ?? '_NÃO_INFORMADO_'}`,
    `- Palavras bloqueadas: ${profile.blockedKeywords.length ? profile.blockedKeywords.join(', ') : '_NÃO_INFORMADO_'}`,
    '',
    '## Formação',
    profile.education.length
      ? profile.education.map((e) => `- ${e.course} — ${e.institution} (${e.period})`).join('\n')
      : '_NÃO_INFORMADO_',
    '',
    '## Respostas Padrão',
    answers,
    '',
  ].join('\n');
}
