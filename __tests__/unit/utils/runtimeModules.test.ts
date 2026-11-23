import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  ensureBrowserRuntimeEnv,
  exeDir,
  isSea,
  loadRuntimeModule,
  runtimeDir,
  runtimeDirCandidates,
  tessdataDir,
} from '../../../src/utils/runtimeModules';
import { packageRoot } from '../../../src/config/paths';

describe('runtimeModules — SEA detection and runtime dir resolution', () => {
  it('isSea is false under tsx/jest', () => {
    expect(isSea()).toBe(false);
  });

  it('exeDir is the directory of the running binary', () => {
    expect(exeDir()).toBe(resolve(process.execPath, '..'));
  });

  it('candidates order: CAREER_RUNTIME → <exe>/career-runtime → packageRoot', () => {
    const candidates = runtimeDirCandidates({ CAREER_RUNTIME: resolve('/rt') });
    expect(candidates[0]).toBe(resolve('/rt'));
    expect(candidates[1]).toBe(join(exeDir(), 'career-runtime'));
    expect(candidates[2]).toBe(packageRoot);
  });

  it('runtimeDir picks the first candidate with node_modules', () => {
    const rt = mkdtempSync(join(tmpdir(), 'cf-rt-'));
    mkdirSync(join(rt, 'node_modules'));
    try {
      expect(runtimeDir({ CAREER_RUNTIME: rt })).toBe(rt);
    } finally {
      rmSync(rt, { recursive: true, force: true });
    }
  });

  it('tessdataDir returns <runtime>/tessdata when it exists, null otherwise', () => {
    const rt = mkdtempSync(join(tmpdir(), 'cf-rt-'));
    mkdirSync(join(rt, 'node_modules'));
    try {
      expect(tessdataDir({ CAREER_RUNTIME: rt })).toBeNull();
      mkdirSync(join(rt, 'tessdata'));
      expect(tessdataDir({ CAREER_RUNTIME: rt })).toBe(join(rt, 'tessdata'));
    } finally {
      rmSync(rt, { recursive: true, force: true });
    }
  });

  it('ensureBrowserRuntimeEnv points PLAYWRIGHT_BROWSERS_PATH at <runtime>/browsers', () => {
    const rt = mkdtempSync(join(tmpdir(), 'cf-rt-'));
    mkdirSync(join(rt, 'node_modules'));
    mkdirSync(join(rt, 'browsers'));
    const prev = process.env.PLAYWRIGHT_BROWSERS_PATH;
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    try {
      ensureBrowserRuntimeEnv({ CAREER_RUNTIME: rt });
      expect(process.env.PLAYWRIGHT_BROWSERS_PATH).toBe(join(rt, 'browsers'));
    } finally {
      if (prev === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
      else process.env.PLAYWRIGHT_BROWSERS_PATH = prev;
      rmSync(rt, { recursive: true, force: true });
    }
  });

  it('ensureBrowserRuntimeEnv keeps a user-defined PLAYWRIGHT_BROWSERS_PATH', () => {
    const prev = process.env.PLAYWRIGHT_BROWSERS_PATH;
    process.env.PLAYWRIGHT_BROWSERS_PATH = resolve('/custom-browsers');
    try {
      ensureBrowserRuntimeEnv({ PLAYWRIGHT_BROWSERS_PATH: resolve('/custom-browsers') });
      expect(process.env.PLAYWRIGHT_BROWSERS_PATH).toBe(resolve('/custom-browsers'));
    } finally {
      if (prev === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
      else process.env.PLAYWRIGHT_BROWSERS_PATH = prev;
    }
  });

  it('loadRuntimeModule falls back to a normal import outside SEA', async () => {
    const mod = await loadRuntimeModule<{ z: unknown }>('zod');
    expect(mod.z).toBeDefined();
  });
});
