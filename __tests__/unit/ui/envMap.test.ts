import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listEnvEntries } from '../../../src/ui/envMap';

const SAVED: Record<string, string | undefined> = {};
function setProcEnv(key: string, value: string | undefined): void {
  if (!(key in SAVED)) SAVED[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
afterEach(() => {
  for (const [k, v] of Object.entries(SAVED)) setProcEnv(k, v);
  for (const k of Object.keys(SAVED)) delete SAVED[k];
});

describe('ui/envMap listEnvEntries', () => {
  it('lists entries with home source and masks secrets', () => {
    const home = mkdtempSync(join(tmpdir(), 'cf-env-'));
    writeFileSync(join(home, '.env'), 'AI_SMART_PROVIDER=groq\nGROQ_API_KEY=gsk_secret\n');
    const { entries, homeEnvFile } = listEnvEntries({
      env: { CAREER_HOME: home },
      envFile: join(home, 'no-cwd.env'),
    });
    expect(homeEnvFile).toBe(join(home, '.env'));
    const provider = entries.find((e) => e.key === 'AI_SMART_PROVIDER');
    expect(provider).toMatchObject({ value: 'groq', source: 'home', masked: false });
    const key = entries.find((e) => e.key === 'GROQ_API_KEY');
    expect(key).toMatchObject({ masked: true });
    expect(key?.value).not.toContain('gsk_secret');
  });

  it('process env wins over .env files for source attribution', () => {
    const home = mkdtempSync(join(tmpdir(), 'cf-env-'));
    writeFileSync(join(home, '.env'), 'EXECUTION_MODE=SEMI_AUTO\n');
    setProcEnv('EXECUTION_MODE', 'FULL_AUTO');
    const { entries } = listEnvEntries({
      env: process.env,
      envFile: join(home, 'no-cwd.env'),
    });
    const e = entries.find((x) => x.key === 'EXECUTION_MODE');
    expect(e).toMatchObject({ value: 'FULL_AUTO', source: 'process' });
  });

  it('exe .env source beats cwd and home in SEA mode', () => {
    const home = mkdtempSync(join(tmpdir(), 'cf-env-'));
    const exe = mkdtempSync(join(tmpdir(), 'cf-exe-'));
    writeFileSync(join(home, '.env'), 'JOB_TITLES=from-home\n');
    writeFileSync(join(exe, '.env'), 'JOB_TITLES=from-exe\nCAREER_HOME=.\n');
    const { entries, exeEnvFile } = listEnvEntries({
      exeDir: exe,
      env: { CAREER_HOME: home },
      envFile: join(exe, 'empty.env'),
    });
    expect(exeEnvFile).toBe(join(exe, '.env'));
    const e = entries.find((x) => x.key === 'JOB_TITLES');
    expect(e).toMatchObject({ value: 'from-exe', source: 'exe' });
  });
});
