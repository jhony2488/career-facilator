import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { careerHome, envFilePath, packageRoot, resolveHome } from '../../../src/config/paths';

describe('paths — diretório de dados da CLI global', () => {
  it('home default é ~/.careerfacilator', () => {
    expect(careerHome({})).toBe(join(homedir(), '.careerfacilator'));
  });

  it('CAREER_HOME sobrescreve o default', () => {
    expect(careerHome({ CAREER_HOME: 'tmp/custom-home' })).toBe(resolve('tmp/custom-home'));
  });

  it('resolveHome junta relativo sob home e respeita absoluto', () => {
    const env = { CAREER_HOME: '/cfhome' };
    expect(resolveHome('storage/jobs.sqlite', env)).toBe(join('/cfhome', 'storage/jobs.sqlite'));
    const abs = resolve('/elsewhere/file.txt');
    expect(resolveHome(abs, env)).toBe(abs);
  });

  it('envFilePath aponta para <home>/.env', () => {
    expect(envFilePath({ CAREER_HOME: '/cfhome' })).toBe(join('/cfhome', '.env'));
  });

  it('packageRoot resolve assets do pacote independente do cwd', () => {
    expect(join(packageRoot, 'src/skills/library')).toContain('skills');
  });
});
