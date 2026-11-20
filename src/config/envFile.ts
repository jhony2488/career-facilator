import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Escreve/atualiza uma chave em arquivo .env preservando comentários,
 * linhas em branco e as demais chaves. Cria o arquivo (e a pasta) se ausente.
 */
export function setEnvKey(path: string, key: string, value: string): void {
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/) : [];
  let replaced = false;
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!replaced && !trimmed.startsWith('#') && trimmed.startsWith(`${key}=`)) {
      replaced = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!replaced) {
    while (out.length && out[out.length - 1].trim() === '') out.pop();
    out.push(`${key}=${value}`);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, out.join('\n') + '\n', 'utf8');
}

/** Remove a chave do arquivo .env, se presente. */
export function unsetEnvKey(path: string, key: string): void {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith('#') || !trimmed.startsWith(`${key}=`);
    });
  writeFileSync(path, lines.join('\n'), 'utf8');
}
