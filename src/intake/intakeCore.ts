import { extractPdfText, type PdfExtractionInput, type PdfReader } from './pdfExtractor';
import { structureProfile, type StructurerModel } from './profileStructurer';
import type { MasterProfileStore } from './masterProfileStore';
import { compileMasterProfile, invalidateDerivedData } from './profileCompiler';
import type {
  IntakeOutcome,
  ProfileConflict,
  ProfileImportMode,
  ProfileImportSource,
} from './types';

export interface ImportResumeInput {
  file: PdfExtractionInput;
  mode: ProfileImportMode;
  source: ProfileImportSource;
}

export interface ImportResumeDeps {
  reader: PdfReader;
  model: StructurerModel;
  store: MasterProfileStore;
}

export interface ImportResumeResult {
  outcome: IntakeOutcome;
  draftPath?: string;
  alert?: string;
  conflicts?: ProfileConflict[];
}

export interface ApproveResult {
  activated: true;
  cacheInvalidated: boolean;
  scoresToRecalculate: boolean;
}

/** Varredura da pasta monitorada — injetável (real em inboxScanner.ts, mock nos testes). */
export interface InboxScanner {
  listPendingPdfs(inboxDir: string): Promise<string[]>;
  moveToProcessed(pdfPath: string, inboxDir: string): Promise<string>;
}

export interface InboxItemResult extends ImportResumeResult {
  path: string;
  archivedTo?: string;
}

export interface ProcessInboxResult {
  scanned: number;
  results: InboxItemResult[];
}

/**
 * Orquestrador da ingestão (doc 13 §13.2): PDF → extração → estruturação →
 * rascunho pendente de revisão. Documento sem texto legível não gera rascunho
 * e nunca chama o modelo.
 */
export async function importResume(
  input: ImportResumeInput,
  deps: ImportResumeDeps,
): Promise<ImportResumeResult> {
  const extraction = await extractPdfText(input.file, { reader: deps.reader });

  if (!extraction.hasTextLayer) {
    return {
      outcome: 'UNREADABLE_DOCUMENT',
      alert:
        'Documento sem camada de texto legível (PDF digitalizado ou corrompido). Nenhum dado foi gerado — converta para um PDF com texto e tente novamente.',
    };
  }

  const profile = await structureProfile({ documentText: extraction.text }, { model: deps.model });

  // Em MERGE, o perfil ativo compilado serve de base para soma e conflitos
  let base;
  if (input.mode === 'MERGE') {
    const active = await deps.store.getActiveProfileMarkdown();
    if (active) base = compileMasterProfile(active).profile;
  }

  const { draftPath, conflicts } = await deps.store.saveDraft(profile, { mode: input.mode, base });
  return { outcome: 'DRAFT_PENDING_REVIEW', draftPath, conflicts };
}

/**
 * Pasta monitorada (doc 13): processa todos os PDFs pendentes da área de
 * entrada como source 'INBOX' e arquiva cada um em processed/ — legíveis ou
 * não — para que nenhum documento seja reprocessado na varredura seguinte.
 */
export async function processInbox(
  input: { inboxDir: string; mode: ProfileImportMode },
  deps: ImportResumeDeps & { scanner: InboxScanner },
): Promise<ProcessInboxResult> {
  const pending = await deps.scanner.listPendingPdfs(input.inboxDir);
  const results: InboxItemResult[] = [];
  for (const path of pending) {
    const result = await importResume({ file: { path }, mode: input.mode, source: 'INBOX' }, deps);
    const archivedTo = await deps.scanner.moveToProcessed(path, input.inboxDir);
    results.push({ ...result, path, archivedTo });
  }
  return { scanned: pending.length, results };
}

/** Aprovação humana: promove o rascunho e invalida os dados derivados. */
export async function approveProfileDraft(deps: {
  store: MasterProfileStore;
}): Promise<ApproveResult> {
  const promoted = await deps.store.promoteDraft();
  const invalidation = invalidateDerivedData();
  return { activated: promoted.activated, ...invalidation };
}
