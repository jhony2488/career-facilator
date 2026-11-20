import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnvFile } from '../../../src/config/loadConfig';
import { setEnvKey, unsetEnvKey } from '../../../src/config/envFile';

describe('envFile — writing keys to .env (config set/unset)', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cf-envfile-'));
    path = join(dir, '.env');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('set creates file and folders when missing', () => {
    const nested = join(dir, 'sub/.env');
    setEnvKey(nested, 'AI_LOCAL_MODEL', 'llama3.2');
    expect(parseEnvFile(nested)).toEqual({ AI_LOCAL_MODEL: 'llama3.2' });
  });

  it('set updates an existing key preserving comments and other lines', () => {
    setEnvKey(path, 'EXECUTION_MODE', 'HYBRID_THRESHOLD');
    setEnvKey(path, 'AI_LOCAL_MODEL', 'qwen2.5:7b');
    setEnvKey(path, 'AI_LOCAL_MODEL', 'llama3.2');

    const env = parseEnvFile(path);
    expect(env.AI_LOCAL_MODEL).toBe('llama3.2');
    expect(env.EXECUTION_MODE).toBe('HYBRID_THRESHOLD');
    // key not duplicated
    expect(readFileSync(path, 'utf8').match(/AI_LOCAL_MODEL=/g)).toHaveLength(1);
  });

  it('set preserves existing comments', () => {
    writeFileSync(path, '# comentário\nA=1\n'); // simulates a manual user edit
    setEnvKey(path, 'B', '2');
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('# comentário');
    expect(content).toContain('A=1');
    expect(content).toContain('B=2');
  });

  it('unset removes the key and ignores a nonexistent file', () => {
    unsetEnvKey(join(dir, 'nada.env'), 'X'); // must not throw
    setEnvKey(path, 'X', '1');
    setEnvKey(path, 'Y', '2');
    unsetEnvKey(path, 'X');
    expect(parseEnvFile(path)).toEqual({ Y: '2' });
    expect(existsSync(path)).toBe(true);
  });
});
