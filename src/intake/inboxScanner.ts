import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';

export const PROCESSED_SUBDIR = 'processed';

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lista PDFs pendentes na área de entrada, em ordem alfabética (determinístico).
 * Pasta inexistente = inbox vazia; a subpasta processed/ nunca entra na lista.
 */
export async function listPendingPdfs(inboxDir: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(inboxDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.pdf'))
    .map((e) => join(inboxDir, e.name))
    .sort();
}

/**
 * Arquiva o PDF já processado em inbox/processed/ para não ser reprocessado
 * (inclusive documentos ilegíveis, que alertariam a cada varredura).
 */
export async function moveToProcessed(pdfPath: string, inboxDir: string): Promise<string> {
  const destDir = join(inboxDir, PROCESSED_SUBDIR);
  await fs.mkdir(destDir, { recursive: true });
  let dest = join(destDir, basename(pdfPath));
  if (await pathExists(dest)) dest = join(destDir, `${Date.now()}-${basename(pdfPath)}`);
  await fs.rename(pdfPath, dest);
  return dest;
}
