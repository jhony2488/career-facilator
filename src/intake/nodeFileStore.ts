import { promises as fs } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { FileStore } from './types';

/** Implementação real do FileStore sobre o disco local. */
export function createNodeFileStore(): FileStore {
  return {
    async readFile(path) {
      try {
        return await fs.readFile(path, 'utf-8');
      } catch {
        return null;
      }
    },
    async writeFile(path, content) {
      await fs.mkdir(dirname(path), { recursive: true });
      await fs.writeFile(path, content, 'utf-8');
    },
    async exists(path) {
      try {
        await fs.access(path);
        return true;
      } catch {
        return false;
      }
    },
    async archiveFile(srcPath, destDir) {
      await fs.mkdir(destDir, { recursive: true });
      const dest = join(destDir, `${Date.now()}-${basename(srcPath)}`);
      await fs.copyFile(srcPath, dest);
      return dest;
    },
  };
}
