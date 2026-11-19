import { compileMasterProfile, invalidateDerivedData } from '../../../src/intake/profileCompiler';
import { SAMPLE_MASTER_MD } from '../../helpers/fixtures';

describe('compileMasterProfile', () => {
  it('compila o perfil-mestre em Markdown para a estrutura tipada', () => {
    // feature/13: Aprovação humana ativa o perfil-mestre (uso downstream)
    const result = compileMasterProfile(SAMPLE_MASTER_MD);

    expect(result.profile.fullName).toBe('Dev Tester');
    expect(result.profile.email).toBe('dev@example.com');
    expect(result.profile.coreStack).toContain('TypeScript');
    expect(result.profile.experiences[0].company).toBe('TechCorp');
  });

  it('adota edições manuais feitas no arquivo mestre', () => {
    // feature/13: Edição manual do perfil-mestre é adotada
    const edited = SAMPLE_MASTER_MD.replace('Dev Tester', 'Dev Tester Editado');
    const result = compileMasterProfile(edited);

    expect(result.profile.fullName).toBe('Dev Tester Editado');
  });

  it('sinaliza seções fora do padrão sem inventar conteúdo', () => {
    // feature/13: regra anti-fabricação — o compilador nunca "corrige" inventando
    const withExtraSection = `${SAMPLE_MASTER_MD}\n## Seção Improvisada\nTexto livre fora do padrão.\n`;
    const result = compileMasterProfile(withExtraSection);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.profile.fullName).toBe('Dev Tester');
  });
});

describe('invalidateDerivedData', () => {
  it('invalida o cache e sinaliza scores para recálculo', () => {
    // feature/13: Atualização do perfil invalida dados derivados
    const result = invalidateDerivedData();

    expect(result.cacheInvalidated).toBe(true);
    expect(result.scoresToRecalculate).toBe(true);
  });
});
