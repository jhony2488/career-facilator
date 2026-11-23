import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { careerHome, envFilePath, packageRoot, resolveHome } from '../../../src/config/paths';

describe('paths — global CLI data directory', () => {
  it('default home is ~/.careerfacilator', () => {
    expect(careerHome({})).toBe(join(homedir(), '.careerfacilator'));
  });

  it('CAREER_HOME overrides the default', () => {
    expect(careerHome({ CAREER_HOME: 'tmp/custom-home' })).toBe(resolve('tmp/custom-home'));
  });

  it('resolveHome joins relative paths under home and respects absolute ones', () => {
    const home = resolve('/cfhome'); // absolute on this machine
    const env = { CAREER_HOME: home };
    expect(resolveHome('storage/jobs.sqlite', env)).toBe(join(home, 'storage/jobs.sqlite'));
    const abs = resolve('/elsewhere/file.txt');
    expect(resolveHome(abs, env)).toBe(abs);
  });

  it('envFilePath points to <home>/.env', () => {
    const home = resolve('/cfhome');
    expect(envFilePath({ CAREER_HOME: home })).toBe(join(home, '.env'));
  });

  it('relative CAREER_HOME anchors on exeDir when provided (portable SEA mode)', () => {
    const exe = resolve('/exe');
    expect(careerHome({ CAREER_HOME: '.' }, { exeDir: exe })).toBe(exe);
    expect(careerHome({ CAREER_HOME: 'dados' }, { exeDir: exe })).toBe(join(exe, 'dados'));
  });

  it('absolute CAREER_HOME ignores exeDir', () => {
    const home = resolve('/cfhome');
    expect(careerHome({ CAREER_HOME: home }, { exeDir: resolve('/exe') })).toBe(home);
  });

  it('resolveHome honors the exeDir anchor for relative home paths', () => {
    const exe = resolve('/exe');
    expect(resolveHome('storage/jobs.sqlite', { CAREER_HOME: '.' }, { exeDir: exe })).toBe(
      join(exe, 'storage/jobs.sqlite'),
    );
  });

  it('packageRoot resolves package assets regardless of cwd', () => {
    expect(join(packageRoot, 'src/skills/library')).toContain('skills');
  });
});
