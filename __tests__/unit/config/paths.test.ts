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

  it('packageRoot resolves package assets regardless of cwd', () => {
    expect(join(packageRoot, 'src/skills/library')).toContain('skills');
  });
});
