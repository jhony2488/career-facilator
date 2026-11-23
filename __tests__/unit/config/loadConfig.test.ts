import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import {
  loadCareerOpsConfig,
  parseEnvFile,
  PROVIDER_DEFAULT_MODELS,
} from '../../../src/config/loadConfig';

describe('loadCareerOpsConfig — model resolution via env', () => {
  const empty = { env: {}, envFile: '' };

  it('no env → careerOps.config defaults', () => {
    const cfg = loadCareerOpsConfig(empty);
    expect(cfg.ai.local.provider).toBe('ollama');
    expect(cfg.ai.local.modelId).toBe('qwen2.5:7b');
    expect(cfg.ai.fast.provider).toBe('groq');
    expect(cfg.ai.fast.modelId).toBe('llama-3.1-8b-instant');
    expect(cfg.ai.smart.provider).toBe('anthropic');
  });

  it('swaps the Ollama model per tier via AI_<T>_MODEL', () => {
    const cfg = loadCareerOpsConfig({ env: { AI_LOCAL_MODEL: 'llama3.2:3b' }, envFile: '' });
    expect(cfg.ai.local.provider).toBe('ollama');
    expect(cfg.ai.local.modelId).toBe('llama3.2:3b');
    expect(cfg.ai.local.apiKeyEnv).toBeUndefined();
  });

  it('provider switch exposes apiKeyEnv and the provider default', () => {
    const cfg = loadCareerOpsConfig({ env: { AI_SMART_PROVIDER: 'kimi' }, envFile: '' });
    expect(cfg.ai.smart.provider).toBe('kimi');
    expect(cfg.ai.smart.modelId).toBe(PROVIDER_DEFAULT_MODELS.kimi);
    expect(cfg.ai.smart.apiKeyEnv).toBe('KIMI_API_KEY');
  });

  it('provider deepseek resolves default model and apiKeyEnv', () => {
    const cfg = loadCareerOpsConfig({ env: { AI_SMART_PROVIDER: 'deepseek' }, envFile: '' });
    expect(cfg.ai.smart.provider).toBe('deepseek');
    expect(cfg.ai.smart.modelId).toBe('deepseek-chat');
    expect(cfg.ai.smart.apiKeyEnv).toBe('DEEPSEEK_API_KEY');
  });

  it('<PROVIDER>_MODEL serves as the tier default', () => {
    const cfg = loadCareerOpsConfig({
      env: { AI_SMART_PROVIDER: 'groq', GROQ_MODEL: 'llama-3.3-70b-versatile' },
      envFile: '',
    });
    expect(cfg.ai.smart.modelId).toBe('llama-3.3-70b-versatile');
    expect(cfg.ai.smart.apiKeyEnv).toBe('GROQ_API_KEY');
  });

  it('AI_<T>_MODEL beats <PROVIDER>_MODEL', () => {
    const cfg = loadCareerOpsConfig({
      env: { AI_SMART_PROVIDER: 'openai', AI_SMART_MODEL: 'gpt-4o', OPENAI_MODEL: 'gpt-4o-mini' },
      envFile: '',
    });
    expect(cfg.ai.smart.modelId).toBe('gpt-4o');
  });

  it('Ollama gets a default baseUrl; AI_<T>_BASE_URL and <P>_BASE_URL override it', () => {
    const cfg = loadCareerOpsConfig(empty);
    expect(cfg.ai.local.baseUrl).toBe('http://localhost:11434');
    const custom = loadCareerOpsConfig({
      env: { OLLAMA_BASE_URL: 'http://gpu:11434' },
      envFile: '',
    });
    expect(custom.ai.local.baseUrl).toBe('http://gpu:11434');
  });

  it('EXECUTION_MODE overrides the default mode', () => {
    const cfg = loadCareerOpsConfig({ env: { EXECUTION_MODE: 'FULL_AUTO' }, envFile: '' });
    expect(cfg.execution.mode).toBe('FULL_AUTO');
  });
});

describe('loadCareerOpsConfig — discovery run limits via env', () => {
  it('defaults to maxJobsPerRun=100 and minJobsPerRun=0', () => {
    const cfg = loadCareerOpsConfig({ env: {}, envFile: '' });
    expect(cfg.execution.maxJobsPerRun).toBe(100);
    expect(cfg.execution.minJobsPerRun).toBe(0);
  });

  it('DISCOVERY_MAX_JOBS_PER_RUN and DISCOVERY_MIN_JOBS_PER_RUN override execution limits', () => {
    const cfg = loadCareerOpsConfig({
      env: { DISCOVERY_MAX_JOBS_PER_RUN: '40', DISCOVERY_MIN_JOBS_PER_RUN: '5' },
      envFile: '',
    });
    expect(cfg.execution.maxJobsPerRun).toBe(40);
    expect(cfg.execution.minJobsPerRun).toBe(5);
  });

  it('ignores non-numeric and empty values', () => {
    const cfg = loadCareerOpsConfig({
      env: { DISCOVERY_MAX_JOBS_PER_RUN: 'abc', DISCOVERY_MIN_JOBS_PER_RUN: ' ' },
      envFile: '',
    });
    expect(cfg.execution.maxJobsPerRun).toBe(100);
    expect(cfg.execution.minJobsPerRun).toBe(0);
  });
});

describe('loadCareerOpsConfig — data directory (global CLI)', () => {
  const home = resolve('/cfhome'); // absolute on this machine

  it('CAREER_HOME directs the profile/storage paths', () => {
    const cfg = loadCareerOpsConfig({ env: { CAREER_HOME: home }, envFile: '' });
    expect(cfg.profile.inboxDir).toBe(join(home, 'storage/profile_inbox/'));
    expect(cfg.profile.masterPath).toBe(join(home, 'src/config/profile.master.md'));
  });

  it('PROFILE_*_PATH overrides individual paths', () => {
    const masterAbs = resolve('/fora/master.md');
    const cfg = loadCareerOpsConfig({
      env: { CAREER_HOME: home, PROFILE_MASTER_PATH: masterAbs },
      envFile: '',
    });
    expect(cfg.profile.masterPath).toBe(masterAbs);
    expect(cfg.profile.inboxDir).toBe(join(home, 'storage/profile_inbox/'));
  });

  it('home .env is read and the local file takes precedence', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cf-home-'));
    writeFileSync(join(dir, '.env'), 'AI_LOCAL_MODEL=modelo-do-home\n');
    const local = join(dir, 'local.env');
    writeFileSync(local, 'AI_FAST_MODEL=modelo-do-local\n');
    const cfg = loadCareerOpsConfig({ env: { CAREER_HOME: dir }, envFile: local });
    expect(cfg.ai.local.modelId).toBe('modelo-do-home');
    expect(cfg.ai.fast.modelId).toBe('modelo-do-local');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('loadCareerOpsConfig — exeDir (binário SEA portátil)', () => {
  it('exe .env overrides the cwd .env, both above the home file', () => {
    const exe = mkdtempSync(join(tmpdir(), 'cf-exe-'));
    const home = mkdtempSync(join(tmpdir(), 'cf-home-'));
    writeFileSync(join(exe, '.env'), 'AI_LOCAL_MODEL=modelo-do-exe\n');
    writeFileSync(join(home, '.env'), 'AI_FAST_MODEL=modelo-do-home\nAI_LOCAL_MODEL=x\n');
    const local = join(exe, 'local.env');
    writeFileSync(local, 'AI_LOCAL_MODEL=modelo-do-cwd\nAI_SMART_MODEL=modelo-do-local\n');
    const cfg = loadCareerOpsConfig({ env: { CAREER_HOME: home }, envFile: local, exeDir: exe });
    expect(cfg.ai.local.modelId).toBe('modelo-do-exe'); // exe > cwd
    expect(cfg.ai.smart.modelId).toBe('modelo-do-local'); // cwd-only key preserved
    expect(cfg.ai.fast.modelId).toBe('modelo-do-home'); // home fills the rest
    rmSync(exe, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  it('process env still wins over the exe .env', () => {
    const exe = mkdtempSync(join(tmpdir(), 'cf-exe-'));
    writeFileSync(join(exe, '.env'), 'AI_LOCAL_MODEL=modelo-do-exe\n');
    const cfg = loadCareerOpsConfig({
      env: { AI_LOCAL_MODEL: 'modelo-do-env' },
      envFile: join(exe, 'inexistente.env'),
      exeDir: exe,
    });
    expect(cfg.ai.local.modelId).toBe('modelo-do-env');
    rmSync(exe, { recursive: true, force: true });
  });

  it('relative CAREER_HOME in the local .env anchors on exeDir', () => {
    const exe = mkdtempSync(join(tmpdir(), 'cf-exe-'));
    const local = join(exe, 'local.env');
    writeFileSync(local, 'CAREER_HOME=.\n');
    const cfg = loadCareerOpsConfig({ env: {}, envFile: local, exeDir: exe });
    expect(cfg.profile.inboxDir).toBe(join(exe, 'storage/profile_inbox/'));
    rmSync(exe, { recursive: true, force: true });
  });

  it('envFile empty disables all file parsing, including the exe .env', () => {
    const exe = mkdtempSync(join(tmpdir(), 'cf-exe-'));
    writeFileSync(join(exe, '.env'), 'AI_LOCAL_MODEL=modelo-do-exe\n');
    const cfg = loadCareerOpsConfig({ env: {}, envFile: '', exeDir: exe });
    expect(cfg.ai.local.modelId).toBe('qwen2.5:7b');
    rmSync(exe, { recursive: true, force: true });
  });
});

describe('loadCareerOpsConfig — fallbacks por tier', () => {
  it('default da spec: local→fast, smart→fast, fast→off', () => {
    const cfg = loadCareerOpsConfig({ env: {}, envFile: '' });
    expect(cfg.ai.local.fallback).toMatchObject({
      provider: cfg.ai.fast.provider,
      modelId: cfg.ai.fast.modelId,
    });
    expect(cfg.ai.smart.fallback).toMatchObject({ provider: cfg.ai.fast.provider });
    expect(cfg.ai.fast.fallback).toBe('off');
  });

  it('AI_<T>_FALLBACK=off desativa', () => {
    const cfg = loadCareerOpsConfig({ env: { AI_SMART_FALLBACK: 'off' }, envFile: '' });
    expect(cfg.ai.smart.fallback).toBe('off');
    expect(cfg.ai.local.fallback).not.toBe('off');
  });

  it('AI_<T>_FALLBACK=<tier> aponta p/ outro tier', () => {
    const cfg = loadCareerOpsConfig({ env: { AI_LOCAL_FALLBACK: 'smart' }, envFile: '' });
    expect(cfg.ai.local.fallback).toMatchObject({
      provider: cfg.ai.smart.provider,
      modelId: cfg.ai.smart.modelId,
    });
  });

  it('AI_<T>_FALLBACK=<provider>:<modelo> cria routing explícito', () => {
    const cfg = loadCareerOpsConfig({
      env: { AI_SMART_FALLBACK: 'groq:llama-3.3-70b' },
      envFile: '',
    });
    expect(cfg.ai.smart.fallback).toMatchObject({
      provider: 'groq',
      modelId: 'llama-3.3-70b',
      apiKeyEnv: 'GROQ_API_KEY',
    });
  });

  it('fallback provider:modelo ollama sem tag → baseUrl padrão', () => {
    const cfg = loadCareerOpsConfig({
      env: { AI_SMART_FALLBACK: 'ollama:llama3.2' },
      envFile: '',
    });
    expect(cfg.ai.smart.fallback).toMatchObject({
      provider: 'ollama',
      modelId: 'llama3.2',
      baseUrl: 'http://localhost:11434',
    });
  });

  it('AI_FALLBACK_ENABLED=false → todos off', () => {
    const cfg = loadCareerOpsConfig({ env: { AI_FALLBACK_ENABLED: 'false' }, envFile: '' });
    expect(cfg.ai.local.fallback).toBe('off');
    expect(cfg.ai.smart.fallback).toBe('off');
    expect(cfg.ai.fast.fallback).toBe('off');
  });
});

describe('loadCareerOpsConfig — national eligibility via env', () => {
  it('defaults: REMOTE+HYBRID with the configured cities', () => {
    const cfg = loadCareerOpsConfig({ env: {}, envFile: '' });
    expect(cfg.marketScope.national.workModels).toEqual(['REMOTE', 'HYBRID']);
    expect(cfg.marketScope.national.allowedCities).toContain('Recife');
  });

  it('NATIONAL_WORK_MODELS overrides accepted models', () => {
    const cfg = loadCareerOpsConfig({
      env: { NATIONAL_WORK_MODELS: 'remote' },
      envFile: '',
    });
    expect(cfg.marketScope.national.workModels).toEqual(['REMOTE']);
  });

  it('ALLOWED_CITIES replaces the permitted hybrid cities', () => {
    const cfg = loadCareerOpsConfig({
      env: { ALLOWED_CITIES: 'São Paulo; Campinas' },
      envFile: '',
    });
    expect(cfg.marketScope.national.allowedCities).toEqual(['São Paulo', 'Campinas']);
  });
});

describe('parseEnvFile', () => {
  it('reads KEY=VALUE, ignores comments and strips quotes', () => {
    const path = join(tmpdir(), `cf-env-${Date.now()}.env`);
    writeFileSync(
      path,
      '# comentário\nAI_LOCAL_MODEL=llama3.2:3b\nAI_SMART_PROVIDER="openai"\nVAZIO=\n',
    );
    const parsed = parseEnvFile(path);
    expect(parsed).toEqual({
      AI_LOCAL_MODEL: 'llama3.2:3b',
      AI_SMART_PROVIDER: 'openai',
      VAZIO: '',
    });
    rmSync(path, { force: true });
  });

  it('strips inline " #" comments; keeps # glued to the value and inside quotes', () => {
    const path = join(tmpdir(), `cf-env-${Date.now()}-c.env`);
    writeFileSync(
      path,
      [
        'A=8000   # tempo máx por probe',
        'B=valor#colado',
        'C="string com # dentro"',
        'D=1 # comentário com # dentro do comentário',
      ].join('\n'),
    );
    const env = parseEnvFile(path);
    expect(env.A).toBe('8000');
    expect(env.B).toBe('valor#colado');
    expect(env.C).toBe('string com # dentro');
    expect(env.D).toBe('1');
    rmSync(path, { force: true });
  });

  it('nonexistent file → empty map', () => {
    expect(parseEnvFile('nao-existe.env')).toEqual({});
  });
});
