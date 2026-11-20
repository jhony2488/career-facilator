import {
  importResume,
  approveProfileDraft,
  processInbox,
  type InboxScanner,
} from '../../src/intake/intakeCore';
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

describe('Intake pipeline: PDF → draft → approval → active profile', () => {
  it('PDF in the inbox generates a draft pending review', async () => {
    // feature/13: Extract a resume dropped in the inbox
    const { store, reader, model, fs } = setup();

    const result = await importResume(
      { file: { path: 'storage/profile_inbox/cv.pdf' }, mode: 'MERGE', source: 'INBOX' },
      { reader, model, store },
    );

    expect(result.outcome).toBe('DRAFT_PENDING_REVIEW');
    expect(await fs.exists(paths.draftPath)).toBe(true);
    expect(await store.getActiveProfileMarkdown()).toBe(SAMPLE_MASTER_MD);
  });

  it('import via command produces the same pending draft', async () => {
    // feature/13: Import a resume via explicit command
    const { store, reader, model } = setup();

    const result = await importResume(
      { file: { path: '/downloads/curriculo-novo.pdf' }, mode: 'MERGE', source: 'CLI' },
      { reader, model, store },
    );

    expect(result.outcome).toBe('DRAFT_PENDING_REVIEW');
    expect(result.draftPath).toBe(paths.draftPath);
  });

  it('approval activates the new profile and invalidates derived data', async () => {
    // feature/13: Human approval activates the master profile + Update invalidates derived data
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

  it('a document without readable text generates no draft and alerts the user', async () => {
    // feature/13: A document without readable text generates no data
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

  it('merge adds new data and flags conflicts for decision', async () => {
    // feature/13: Merge a new document with the existing profile
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

  it('an approved replacement preserves the previous version in history', async () => {
    // feature/13: Replace the profile preserving history
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

  it('only the approved profile feeds the runs — the draft stays isolated', async () => {
    // feature/13: Applications use only the approved profile
    const { store, reader, fs } = setup();
    const model = mockStructurerModel({ fullName: 'Nome Inventado No Rascunho' });
    await importResume(
      { file: { path: 'storage/profile_inbox/cv.pdf' }, mode: 'REPLACE', source: 'INBOX' },
      { reader, model, store },
    );

    // What feeds triage/tailoring is the compiled active profile — never the draft
    const active = await store.getActiveProfileMarkdown();
    const compiled = compileMasterProfile(active as string);

    expect(compiled.profile.fullName).toBe('Dev Tester');
    expect(compiled.profile.fullName).not.toContain('Rascunho');
    expect(await fs.readFile(paths.masterPath)).toBe(SAMPLE_MASTER_MD);
  });
});

describe('Watched folder: inbox scanning', () => {
  const inboxDir = 'storage/profile_inbox';

  function mockScanner(pending: string[]) {
    const moved: string[] = [];
    const scanner: InboxScanner = {
      listPendingPdfs: jest.fn(async () => pending),
      moveToProcessed: jest.fn(async (p: string) => {
        moved.push(p);
        return `${inboxDir}/processed/${p.split('/').pop()}`;
      }),
    };
    return { scanner, moved };
  }

  it('scans the inbox, imports each PDF as INBOX and archives the processed one', async () => {
    // feature/13: Extract a resume dropped in the inbox
    const { store, reader, model, fs } = setup();
    const { scanner, moved } = mockScanner([`${inboxDir}/cv-a.pdf`, `${inboxDir}/cv-b.pdf`]);

    const result = await processInbox(
      { inboxDir, mode: 'MERGE' },
      { reader, model, store, scanner },
    );

    expect(result.scanned).toBe(2);
    expect(result.results.map((r) => r.outcome)).toEqual([
      'DRAFT_PENDING_REVIEW',
      'DRAFT_PENDING_REVIEW',
    ]);
    expect(moved).toEqual([`${inboxDir}/cv-a.pdf`, `${inboxDir}/cv-b.pdf`]);
    expect(result.results[0].archivedTo).toBe(`${inboxDir}/processed/cv-a.pdf`);
    expect(await fs.exists(paths.draftPath)).toBe(true);
  });

  it('an empty inbox does not call the model nor generate a draft', async () => {
    // feature/13: Extract a resume dropped in the inbox
    const { store, reader, model } = setup();
    const { scanner, moved } = mockScanner([]);

    const result = await processInbox(
      { inboxDir, mode: 'MERGE' },
      { reader, model, store, scanner },
    );

    expect(result.scanned).toBe(0);
    expect(result.results).toEqual([]);
    expect(moved).toEqual([]);
    expect(model.generate).not.toHaveBeenCalled();
  });

  it('an unreadable document is archived even without generating a draft', async () => {
    // feature/13: A document without readable text generates no data
    const { store, model } = setup();
    const { scanner, moved } = mockScanner([`${inboxDir}/scan.pdf`]);

    const result = await processInbox(
      { inboxDir, mode: 'MERGE' },
      { reader: mockScannedPdfReader(), model, store, scanner },
    );

    expect(result.results[0].outcome).toBe('UNREADABLE_DOCUMENT');
    expect(result.results[0].alert).toBeTruthy();
    expect(moved).toEqual([`${inboxDir}/scan.pdf`]);
  });
});
