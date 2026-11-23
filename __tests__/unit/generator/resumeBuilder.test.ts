import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildResumePdf, fallbackResumeMarkdown } from '../../../src/generator/resumeBuilder';
import { makeMasterProfile } from '../../helpers/factories';

/**
 * feature/05 — the tailored resume must be materialized as a REAL .pdf on disk
 * (before, only an .html was written next to a .pdf filename — the upload step
 * then failed to attach anything).
 */
describe('resumeBuilder — real PDF materialization', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'resume-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes a real binary PDF at outputPath', async () => {
    const out = join(dir, 'storage', 'generated_resumes', 'job-1.pdf');
    const { filePath } = await buildResumePdf({
      resumeMarkdown: '# Dev Tester\n## Experiência\n- TypeScript por 5 anos',
      outputPath: out,
    });
    expect(filePath).toBe(out);
    expect(existsSync(out)).toBe(true);
    const buf = await readFile(out);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.toString('latin1')).toContain('%%EOF');
    expect(buf.length).toBeGreaterThan(300);
  });

  it('creates missing parent directories', async () => {
    const out = join(dir, 'deep', 'nested', 'cv.pdf');
    await buildResumePdf({ resumeMarkdown: 'plain text', outputPath: out });
    expect(existsSync(out)).toBe(true);
  });

  it('still writes a valid (minimal) PDF when markdown is empty', async () => {
    const out = join(dir, 'cv.pdf');
    await buildResumePdf({ resumeMarkdown: '   ', outputPath: out });
    const buf = await readFile(out);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});

describe('fallbackResumeMarkdown — anti-fabrication fallback', () => {
  it('synthesizes markdown strictly from master profile fields', () => {
    const profile = makeMasterProfile();
    const md = fallbackResumeMarkdown(profile);
    expect(md).toContain(profile.fullName);
    expect(md).toContain(profile.email);
    expect(md).toContain(profile.phone);
    for (const s of profile.coreStack) expect(md).toContain(s);
    for (const p of profile.projects) expect(md).toContain(p.name);
  });
});
