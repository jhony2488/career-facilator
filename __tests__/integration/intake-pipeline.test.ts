import { importResume, approveProfileDraft } from '../../src/intake/intakeCore';
import { compileMasterProfile } from '../../src/intake/profileCompiler';
import { MasterProfileStore } from '../../src/intake/masterProfileStore';
import type { ProfileConflict } from '../helpers/contracts';
import {
  mockFileStore,
  mockPdfReader,
  mockScannedPdfReader,
  mockStructurerModel,
} from '../helpers/mocks';
import { SAMPLE_MASTER_MD } from '../helpers/fixtures';

const paths = {
  draftPath: 'storage/profile.draft.md',
  masterPath: 'src/config/profile.master.md',
  historyDir: 'storage/profile_history',
};

function setup(activeMd: string | null = SAMPLE_MASTER_MD) {
  const fs = mockFileStore(activeMd ? { [paths.masterPath]: activeMd } : {});
  return {
    fs,
    store: new MasterProfileStore(paths, { fs }),
    reader: mockPdfReader(),
    model: mockStructurerModel(),
  };
}

describe('Pipeline de intake: PDF → rascunho → aprovação → perfil ativo', () => {
  it('PDF na área de entrada gera rascunho pendente de revisão', async () => {
    // feature/13: Extrair currículo depositado na área de entrada
    const { store, reader, model, fs } = setup();

    const result = await importResume(
      { file: { path: 'storage/profile_inbox/cv.pdf' }, mode: 'MERGE', source: 'INBOX' },
      { reader, model, store },
    );

    expect(result.outcome).toBe('DRAFT_PENDING_REVIEW');
    expect(await fs.exists(paths.draftPath)).toBe(true);
    expect(await store.getActiveProfileMarkdown()).toBe(SAMPLE_MASTER_MD);
  });

  it('importação por comando produz o mesmo rascunho pendente', async () => {
    // feature/13: Importar currículo por comando explícito
    const { store, reader, model } = setup();

    const result = await importResume(
      { file: { path: '/downloads/curriculo-novo.pdf' }, mode: 'MERGE', source: 'CLI' },
      { reader, model, store },
    );

    expect(result.outcome).toBe('DRAFT_PENDING_REVIEW');
    expect(result.draftPath).toBe(paths.draftPath);
  });

  it('aprovação ativa o novo perfil e invalida os dados derivados', async () => {
    // feature/13: Aprovação humana ativa o perfil-mestre + Atualização invalida dados derivados
    const { store, reader, model } = setup();
    await importResume(
      { file: { path: 'storage/profile_inbox/cv.pdf' }, mode: 'REPLACE', source: 'INBOX' },
      { reader, model, store },
    );

    const approved = await approveProfileDraft({ store });

    expect(approved.activated).toBe(true);
    expect(approved.cacheInvalidated).toBe(true);
    expect(approved.scoresToRecalculate).toBe(true);
  });

  it('documento sem texto legível não gera rascunho e alerta o usuário', async () => {
    // feature/13: Documento sem texto legível não gera dados
    const { store, model, fs } = setup();
    const reader = mockScannedPdfReader();

    const result = await importResume(
      { file: { path: 'storage/profile_inbox/scaneado.pdf' }, mode: 'MERGE', source: 'INBOX' },
      { reader, model, store },
    );

    expect(result.outcome).toBe('UNREADABLE_DOCUMENT');
    expect(result.alert).toBeTruthy();
    expect(await fs.exists(paths.draftPath)).toBe(false);
    expect(model.generate).not.toHaveBeenCalled();
  });

  it('merge soma dados novos e sinaliza conflitos para decisão', async () => {
    // feature/13: Mesclar novo documento com o perfil existente
    const { store, reader, fs } = setup();
    const model = mockStructurerModel({ certifications: ['AWS SAA'], email: 'outro@example.com' });

    const result = await importResume(
      { file: { path: 'storage/profile_inbox/cv2.pdf' }, mode: 'MERGE', source: 'INBOX' },
      { reader, model, store },
    );

    expect(result.outcome).toBe('DRAFT_PENDING_REVIEW');
    expect(result.conflicts?.some((c: ProfileConflict) => c.field === 'email')).toBe(true);
    const draft = await fs.readFile(paths.draftPath);
    expect(draft).toContain('AWS SAA');
    expect(draft).toContain('Dev Tester');
  });

  it('substituição aprovada preserva a versão anterior no histórico', async () => {
    // feature/13: Substituir o perfil preservando histórico
    const { store, reader, model } = setup();
    await importResume(
      { file: { path: 'storage/profile_inbox/cv.pdf' }, mode: 'REPLACE', source: 'INBOX' },
      { reader, model, store },
    );

    const approved = await approveProfileDraft({ store });

    expect(approved.activated).toBe(true);
    const active = await store.getActiveProfileMarkdown();
    expect(active).not.toBe(SAMPLE_MASTER_MD);
  });

  it('somente o perfil aprovado alimenta as execuções — rascunho fica isolado', async () => {
    // feature/13: Candidaturas usam apenas o perfil aprovado
    const { store, reader, fs } = setup();
    const model = mockStructurerModel({ fullName: 'Nome Inventado No Rascunho' });
    await importResume(
      { file: { path: 'storage/profile_inbox/cv.pdf' }, mode: 'REPLACE', source: 'INBOX' },
      { reader, model, store },
    );

    // O que alimenta triagem/tailoring é o perfil ativo compilado — nunca o rascunho
    const active = await store.getActiveProfileMarkdown();
    const compiled = compileMasterProfile(active as string);

    expect(compiled.profile.fullName).toBe('Dev Tester');
    expect(compiled.profile.fullName).not.toContain('Rascunho');
    expect(await fs.readFile(paths.masterPath)).toBe(SAMPLE_MASTER_MD);
  });
});
