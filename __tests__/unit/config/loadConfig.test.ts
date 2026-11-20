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
    const custom = loadCareerOpsConfig({ env: { OLLAMA_BASE_URL: 'http://gpu:11434' }, envFile: '' });
    expect(custom.ai.local.baseUrl).toBe('http://gpu:11434');
  });

  it('EXECUTION_MODE overrides the default mode', () => {
    const cfg = loadCareerOpsConfig({ env: { EXECUTION_MODE: 'FULL_AUTO' }, envFile: '' });
    expect(cfg.execution.mode).toBe('FULL_AUTO');
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

  it('nonexistent file → empty map', () => {
    expect(parseEnvFile('nao-existe.env')).toEqual({});
  });
});
