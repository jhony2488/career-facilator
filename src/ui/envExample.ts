import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageRoot } from '../config/paths';
import { readUiAsset } from './readUiAsset';

/**
 * Parser do `.env.example` raiz — fonte de verdade das variáveis documentadas.
 * Produz seções com itens {key, default, comment, active} para a aba Config
 * mostrar tudo que pode ser configurado (não só o que já está setado).
 * No exe SEA o arquivo vem como asset `ui/env.example` (ver bundle.mjs).
 */
export interface EnvExampleItem {
  key: string;
  /** Valor default no exemplo (string vazia quando a linha é só `KEY=`). */
  default: string;
  /** Comentário de linha/coluna capturado (`# explicação`). */
  comment: string;
  /** Linha comentada no exemplo (# KEY=) — só sugestão de chave. */
  commented: boolean;
}

export interface EnvExampleSection {
  title: string;
  items: EnvExampleItem[];
}

const KEY_RE = /^#?\s*([A-Z][A-Z0-9_]*)=(.*?)(?:\s+#\s?(.*))?$/;
const SECTION_RE = /^#\s*(?:={2,}|-{2,})\s*(.+?)\s*(?:={2,}|-{2,})\s*$/;

export function parseEnvExample(content: string): EnvExampleSection[] {
  const sections: EnvExampleSection[] = [];
  let section: EnvExampleSection = { title: 'Geral', items: [] };
  sections.push(section);
  let lastComment = '';
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    const sec = SECTION_RE.exec(line);
    if (sec) {
      if (section.items.length === 0) {
        section.title = sec[1];
      } else {
        section = { title: sec[1], items: [] };
        sections.push(section);
      }
      lastComment = '';
      continue;
    }
    if (line.startsWith('#') && !/^#\s*[A-Z][A-Z0-9_]*=/.test(line)) {
      // Comentário solto — candidato a descrição da próxima chave.
      lastComment = line.replace(/^#\s*/, '');
      continue;
    }
    const m = KEY_RE.exec(line);
    if (m) {
      section.items.push({
        key: m[1],
        default: m[2].trim(),
        comment: m[3]?.trim() ?? lastComment,
        commented: line.startsWith('#'),
      });
      lastComment = '';
      continue;
    }
    if (line === '') lastComment = '';
  }
  return sections.filter((s) => s.items.length > 0);
}

/** Lê o `.env.example` — asset SEA primeiro; fallback no packageRoot (dev). */
export function readEnvExample(): string | null {
  const asset = readUiAsset('env.example');
  if (asset) return asset.toString('utf8');
  const p = join(packageRoot, '.env.example');
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}
