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
  it('saves the extracted profile as a draft without changing the active profile', async () => {
    // feature/13: Extract the resume dropped in the inbox area
    const { store, fs } = setup();

    const result = await store.saveDraft(makeExtractedProfile(), { mode: 'REPLACE' });

    expect(result.draftPath).toBe(paths.draftPath);
    expect(await fs.readFile(paths.draftPath)).not.toBeNull();
    expect(await store.getActiveProfileMarkdown()).toBe(SAMPLE_MASTER_MD);
  });

  it('keeps the previous version active while the draft is not approved', async () => {
    // feature/13: Previous profile stays active while the draft is not approved
    const { store } = setup();
    await store.saveDraft(makeExtractedProfile({ fullName: 'Dev Tester Draft' }), {
      mode: 'REPLACE',
    });

    const active = await store.getActiveProfileMarkdown();

    expect(active).toBe(SAMPLE_MASTER_MD);
    expect(active).not.toContain('Draft');
  });

  it('promotes the draft to active profile after approval', async () => {
    // feature/13: Human approval activates the master profile
    const { store } = setup();
    await store.saveDraft(makeExtractedProfile({ fullName: 'Dev Tester Approved' }), {
      mode: 'REPLACE',
    });

    const promoted = await store.promoteDraft();

    expect(promoted.activated).toBe(true);
    expect(await store.getActiveProfileMarkdown()).toContain('Dev Tester Approved');
  });

  it('archives the previous version to history when replacing', async () => {
    // feature/13: Replace the profile preserving history
    const { store, fs } = setup();
    await store.saveDraft(makeExtractedProfile(), { mode: 'REPLACE' });

    const promoted = await store.promoteDraft();

    expect(promoted.archivedTo).toContain(paths.historyDir);
    expect(await fs.readFile(promoted.archivedTo as string)).toBe(SAMPLE_MASTER_MD);
  });

  it('merges new data without deleting the existing data', async () => {
    // feature/13: Merge a new document with the existing profile
    const { store } = setup();
    const base = makeMasterProfile();
    const incoming = makeExtractedProfile({ certifications: ['AWS SAA'] });

    await store.saveDraft(incoming, { mode: 'MERGE', base });

    const draft = await store.getDraftMarkdown();
    expect(draft).toContain('AWS SAA');
    expect(draft).toContain('dev@example.com');
    expect(draft).toContain('TypeScript');
  });

  it('flags conflicting fields instead of overwriting on its own', async () => {
    // feature/13: Merge a new document with the existing profile (conflicts flagged)
    const { store } = setup();
    const base = makeMasterProfile({ email: 'dev@example.com' });
    const incoming = makeExtractedProfile({ email: 'other@example.com' });

    const result = await store.saveDraft(incoming, { mode: 'MERGE', base });

    expect(result.conflicts.some((c: ProfileConflict) => c.field === 'email')).toBe(true);
    const emailConflict = result.conflicts.find((c: ProfileConflict) => c.field === 'email');
    expect(emailConflict?.existing).toBe('dev@example.com');
    expect(emailConflict?.incoming).toBe('other@example.com');
  });
});
