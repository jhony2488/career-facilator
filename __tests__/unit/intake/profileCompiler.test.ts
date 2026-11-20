import { compileMasterProfile, invalidateDerivedData } from '../../../src/intake/profileCompiler';
import { SAMPLE_MASTER_MD } from '../../helpers/fixtures';

describe('compileMasterProfile', () => {
  it('compiles the master profile Markdown into the typed structure', () => {
    // feature/13: Human approval activates the master profile (downstream use)
    const result = compileMasterProfile(SAMPLE_MASTER_MD);

    expect(result.profile.fullName).toBe('Dev Tester');
    expect(result.profile.email).toBe('dev@example.com');
    expect(result.profile.coreStack).toContain('TypeScript');
    expect(result.profile.experiences[0].company).toBe('TechCorp');
  });

  it('adopts manual edits made to the master file', () => {
    // feature/13: Manual edit of the master profile is adopted
    const edited = SAMPLE_MASTER_MD.replace('Dev Tester', 'Dev Tester Edited');
    const result = compileMasterProfile(edited);

    expect(result.profile.fullName).toBe('Dev Tester Edited');
  });

  it('flags non-standard sections without inventing content', () => {
    // feature/13: anti-fabrication rule — the compiler never "fixes" by inventing
    const withExtraSection = `${SAMPLE_MASTER_MD}\n## Improvised Section\nFree-form text outside the standard.\n`;
    const result = compileMasterProfile(withExtraSection);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.profile.fullName).toBe('Dev Tester');
  });
});

describe('invalidateDerivedData', () => {
  it('invalidates the cache and flags scores for recalculation', () => {
    // feature/13: Profile update invalidates derived data
    const result = invalidateDerivedData();

    expect(result.cacheInvalidated).toBe(true);
    expect(result.scoresToRecalculate).toBe(true);
  });
});
