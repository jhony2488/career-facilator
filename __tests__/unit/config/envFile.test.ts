import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnvFile } from '../../../src/config/loadConfig';
import { setEnvKey, unsetEnvKey } from '../../../src/config/envFile';

describe('envFile — escrita de chaves no .env (config set/unset)', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cf-envfile-'));
    path = join(dir, '.env');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('set cria arquivo e pastas quando ausentes', () => {
    const nested = join(dir, 'sub/.env');
    setEnvKey(nested, 'AI_LOCAL_MODEL', 'llama3.2');
    expect(parseEnvFile(nested)).toEqual({ AI_LOCAL_MODEL: 'llama3.2' });
  });

  it('set atualiza chave existente preservando comentários e demais linhas', () => {
    setEnvKey(path, 'EXECUTION_MODE', 'HYBRID_THRESHOLD');
    setEnvKey(path, 'AI_LOCAL_MODEL', 'qwen2.5:7b');
    setEnvKey(path, 'AI_LOCAL_MODEL', 'llama3.2');

    const env = parseEnvFile(path);
    expect(env.AI_LOCAL_MODEL).toBe('llama3.2');
    expect(env.EXECUTION_MODE).toBe('HYBRID_THRESHOLD');
    // chave não duplicada
    expect(readFileSync(path, 'utf8').match(/AI_LOCAL_MODEL=/g)).toHaveLength(1);
  });

  it('set preserva comentários existentes', () => {
    writeFileSync(path, '# comentário\nA=1\n'); // simula edição manual do usuário
    setEnvKey(path, 'B', '2');
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('# comentário');
    expect(content).toContain('A=1');
    expect(content).toContain('B=2');
  });

  it('unset remove a chave e ignora arquivo inexistente', () => {
    unsetEnvKey(join(dir, 'nada.env'), 'X'); // não deve lançar
    setEnvKey(path, 'X', '1');
    setEnvKey(path, 'Y', '2');
    unsetEnvKey(path, 'X');
    expect(parseEnvFile(path)).toEqual({ Y: '2' });
    expect(existsSync(path)).toBe(true);
  });
});
