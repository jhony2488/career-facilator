export type ProfileImportMode = 'MERGE' | 'REPLACE';
export type ProfileImportSource = 'INBOX' | 'CLI';
export type IntakeOutcome = 'DRAFT_PENDING_REVIEW' | 'UNREADABLE_DOCUMENT';

export interface ProfileConflict {
  field: string;
  existing: string;
  incoming: string;
}

/** Adaptador de filesystem injetável — store real ou in-memory nos testes. */
export interface FileStore {
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  archiveFile(srcPath: string, destDir: string): Promise<string>;
}
