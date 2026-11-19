import { MasterProfileStore } from '../../../src/intake/masterProfileStore';
import type { ProfileConflict } from '../../helpers/contracts';
import { mockFileStore } from '../../helpers/mocks';
import { makeExtractedProfile, makeMasterProfile } from '../../helpers/factories';
import { SAMPLE_MASTER_MD } from '../../helpers/fixtures';

const paths = {
  draftPath: 'storage/profile.draft.md',
  masterPath: 'src/config/profile.master.md',
  historyDir: 'storage/profile_history',
};

function setup(activeMd: string | null = SAMPLE_MASTER_MD) {
  const fs = mockFileStore(activeMd ? { [paths.masterPath]: activeMd } : {});
  return { store: new MasterProfileStore(paths, { fs }), fs };
}

describe('MasterProfileStore', () => {
  it('grava o perfil extraído como rascunho sem alterar o perfil ativo', async () => {
    // feature/13: Extrair currículo depositado na área de entrada
    const { store, fs } = setup();

    const result = await store.saveDraft(makeExtractedProfile(), { mode: 'REPLACE' });

    expect(result.draftPath).toBe(paths.draftPath);
    expect(await fs.readFile(paths.draftPath)).not.toBeNull();
    expect(await store.getActiveProfileMarkdown()).toBe(SAMPLE_MASTER_MD);
  });

  it('mantém a versão anterior ativa enquanto o rascunho não é aprovado', async () => {
    // feature/13: Perfil anterior permanece ativo enquanto o rascunho não é aprovado
    const { store } = setup();
    await store.saveDraft(makeExtractedProfile({ fullName: 'Dev Tester Rascunho' }), { mode: 'REPLACE' });

    const active = await store.getActiveProfileMarkdown();

    expect(active).toBe(SAMPLE_MASTER_MD);
    expect(active).not.toContain('Rascunho');
  });

  it('promove o rascunho a perfil ativo após aprovação', async () => {
    // feature/13: Aprovação humana ativa o perfil-mestre
    const { store } = setup();
    await store.saveDraft(makeExtractedProfile({ fullName: 'Dev Tester Aprovado' }), { mode: 'REPLACE' });

    const promoted = await store.promoteDraft();

    expect(promoted.activated).toBe(true);
    expect(await store.getActiveProfileMarkdown()).toContain('Dev Tester Aprovado');
  });

  it('arquiva a versão anterior no histórico ao substituir', async () => {
    // feature/13: Substituir o perfil preservando histórico
    const { store, fs } = setup();
    await store.saveDraft(makeExtractedProfile(), { mode: 'REPLACE' });

    const promoted = await store.promoteDraft();

    expect(promoted.archivedTo).toContain(paths.historyDir);
    expect(await fs.readFile(promoted.archivedTo as string)).toBe(SAMPLE_MASTER_MD);
  });

  it('mescla novos dados sem apagar os existentes', async () => {
    // feature/13: Mesclar novo documento com o perfil existente
    const { store } = setup();
    const base = makeMasterProfile();
    const incoming = makeExtractedProfile({ certifications: ['AWS SAA'] });

    await store.saveDraft(incoming, { mode: 'MERGE', base });

    const draft = await store.getDraftMarkdown();
    expect(draft).toContain('AWS SAA');
    expect(draft).toContain('dev@example.com');
    expect(draft).toContain('TypeScript');
  });

  it('sinaliza trechos conflitantes em vez de sobrescrever sozinho', async () => {
    // feature/13: Mesclar novo documento com o perfil existente (conflitos sinalizados)
    const { store } = setup();
    const base = makeMasterProfile({ email: 'dev@example.com' });
    const incoming = makeExtractedProfile({ email: 'outro@example.com' });

    const result = await store.saveDraft(incoming, { mode: 'MERGE', base });

    expect(result.conflicts.some((c: ProfileConflict) => c.field === 'email')).toBe(true);
    const emailConflict = result.conflicts.find((c: ProfileConflict) => c.field === 'email');
    expect(emailConflict?.existing).toBe('dev@example.com');
    expect(emailConflict?.incoming).toBe('outro@example.com');
  });
});
