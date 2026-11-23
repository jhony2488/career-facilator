import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageRoot } from '../config/paths';
import { isSea } from '../utils/runtimeModules';

/**
 * Asset estático da UI (`src/ui/public/*`). Em dev lê do disco via packageRoot;
 * no binário SEA usa `sea.getAsset('ui/<rel>')` — as keys são registradas pelo
 * bundle.mjs (ver scripts). Retorna null quando o asset não existe.
 */
export function readUiAsset(rel: string): Buffer | null {
  if (isSea()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sea = require('node:sea') as { getAsset?: (key: string) => ArrayBuffer };
      const buf = sea.getAsset?.(`ui/${rel}`);
      return buf ? Buffer.from(buf) : null;
    } catch {
      return null;
    }
  }
  const p = join(packageRoot, 'src', 'ui', 'public', rel);
  return existsSync(p) ? readFileSync(p) : null;
}
