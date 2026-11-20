import {
  chunkProfile,
  retrieveRelevant,
  retrieveByEmbedding,
  retrieveHybrid,
  buildProfileContext,
  ALWAYS_INCLUDE,
} from '../../../src/ai/rag/profileRetriever';
import { makeMasterProfile } from '../../helpers/factories';

const profile = {
  ...makeMasterProfile(),
  summary: 'Desenvolvedor fullstack TypeScript com foco em produtos web',
  languages: ['Português', 'Inglês'],
  experiences: [
    {
      role: 'Senior Fullstack Engineer',
      company: 'Nubank',
      period: '2021-2024',
      highlights: ['APIs REST em TypeScript', 'microsserviços'],
    },
    {
      role: 'Mobile Dev',
      company: 'Outra',
      period: '2019-2021',
      highlights: ['React Native'],
    },
  ],
  openSourceProjects: [
    { name: 'CLI-tool', repo: 'gh/x', summary: 'ferramenta CLI Node', metrics: ['100 stars'] },
  ],
  education: [{ course: 'CC', institution: 'UFPE', period: '2018' }],
};

describe('chunkProfile', () => {
  it('produz chunks rotulados para todas as seções', () => {
    const chunks = chunkProfile(profile);
    const sections = new Set(chunks.map((c) => c.section));
    for (const s of ['personal', 'summary', 'coreStack', 'standardAnswers', 'languages', 'experiences', 'projects', 'openSourceProjects', 'education']) {
      expect(sections).toContain(s);
    }
    expect(chunks.filter((c) => c.section === 'experiences')).toHaveLength(2);
  });

  it('perfil mínimo (MasterProfileLike) — não explode com campos ausentes', () => {
    const chunks = chunkProfile(makeMasterProfile());
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some((c) => c.id === 'personal')).toBe(true);
  });
});

describe('retrieveRelevant — léxico', () => {
  const chunks = chunkProfile(profile);

  it('sempre inclui esqueleto (personal/coreStack/standardAnswers)', () => {
    const out = retrieveRelevant(chunks, { keywords: ['qualquercoisa'] });
    const sections = out.map((c) => c.section);
    for (const s of ALWAYS_INCLUDE) expect(sections).toContain(s);
  });

  it('ranqueia chunk relevante primeiro — experiência Nubank para vaga TypeScript', () => {
    const out = retrieveRelevant(chunks, { keywords: ['TypeScript', 'REST'] });
    const optional = out.filter((c) => !ALWAYS_INCLUDE.includes(c.section));
    expect(optional[0]?.text).toContain('Nubank');
  });

  it('topK limita chunks opcionais', () => {
    const out = retrieveRelevant(chunks, { keywords: ['TypeScript'] }, { topK: 1 });
    expect(out.filter((c) => !ALWAYS_INCLUDE.includes(c.section)).length).toBeLessThanOrEqual(1);
  });

  it('query sem overlap → só esqueleto', () => {
    const out = retrieveRelevant(chunks, { keywords: ['kubernetes-xyz'], jobText: 'cobol fortran' });
    expect(out.every((c) => ALWAYS_INCLUDE.includes(c.section))).toBe(true);
  });
});

describe('retrieveByEmbedding — semântico', () => {
  const chunks = chunkProfile(profile);
  const embedder = {
    embed: jest.fn(async (texts: string[]) =>
      // vetor falso: cosine maior para textos contendo 'TypeScript'
      texts.map((t) => [t.includes('TypeScript') ? 1 : 0, t.includes('Nubank') ? 1 : 0]),
    ),
  };

  it('usa cosine similarity do embedder e mantém esqueleto', async () => {
    const out = await retrieveByEmbedding(chunks, 'TypeScript job', embedder, { topK: 2 });
    expect(embedder.embed).toHaveBeenCalled();
    expect(out.some((c) => c.text.includes('Nubank'))).toBe(true);
    expect(out.filter((c) => !ALWAYS_INCLUDE.includes(c.section)).length).toBe(2);
  });
});

describe('retrieveHybrid', () => {
  const chunks = chunkProfile(profile);

  it('sem embedder → igual ao léxico', async () => {
    const lexical = retrieveRelevant(chunks, { keywords: ['TypeScript'] });
    const hybrid = await retrieveHybrid(chunks, { keywords: ['TypeScript'] }, undefined);
    expect(hybrid.map((c) => c.id)).toEqual(lexical.map((c) => c.id));
  });

  it('embedder falha → fallback léxico silencioso', async () => {
    const failing = { embed: () => Promise.reject<number[][]>(new Error('embed offline')) };
    const out = await retrieveHybrid(chunks, { keywords: ['TypeScript'] }, failing);
    expect(out.length).toBeGreaterThan(0);
  });

  it('com embedder → fusão RRF retorna chunks', async () => {
    const emb = { embed: async (texts: string[]) => texts.map(() => [1, 0]) };
    const out = await retrieveHybrid(chunks, { keywords: ['TypeScript'] }, emb, { topK: 2 });
    expect(out.filter((c) => !ALWAYS_INCLUDE.includes(c.section)).length).toBe(2);
  });
});

describe('buildProfileContext', () => {
  it('serializa seções em markdown compacto', () => {
    const chunks = chunkProfile(profile).slice(0, 2);
    const out = buildProfileContext(chunks);
    expect(out).toContain('### personal');
    expect(out).toContain(profile.email);
  });
});
