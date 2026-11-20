import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync, rmSync } from 'node:fs';
import {
  loadCareerOpsConfig,
  parseEnvFile,
  PROVIDER_DEFAULT_MODELS,
} from '../../../src/config/loadConfig';

describe('loadCareerOpsConfig — resolução de modelos via env', () => {
  const empty = { env: {}, envFile: '' };

  it('sem env → defaults do careerOps.config', () => {
    const cfg = loadCareerOpsConfig(empty);
    expect(cfg.ai.local.provider).toBe('ollama');
    expect(cfg.ai.local.modelId).toBe('qwen2.5:7b');
    expect(cfg.ai.fast.provider).toBe('groq');
    expect(cfg.ai.fast.modelId).toBe('llama-3.1-8b-instant');
    expect(cfg.ai.smart.provider).toBe('anthropic');
  });

  it('troca o modelo Ollama por tier via AI_<T>_MODEL', () => {
    const cfg = loadCareerOpsConfig({ env: { AI_LOCAL_MODEL: 'llama3.2:3b' }, envFile: '' });
    expect(cfg.ai.local.provider).toBe('ollama');
    expect(cfg.ai.local.modelId).toBe('llama3.2:3b');
    expect(cfg.ai.local.apiKeyEnv).toBeUndefined();
  });

  it('troca de provider expõe apiKeyEnv e default do provider', () => {
    const cfg = loadCareerOpsConfig({ env: { AI_SMART_PROVIDER: 'kimi' }, envFile: '' });
    expect(cfg.ai.smart.provider).toBe('kimi');
    expect(cfg.ai.smart.modelId).toBe(PROVIDER_DEFAULT_MODELS.kimi);
    expect(cfg.ai.smart.apiKeyEnv).toBe('KIMI_API_KEY');
  });

  it('<PROVIDER>_MODEL serve de default do tier', () => {
    const cfg = loadCareerOpsConfig({
      env: { AI_SMART_PROVIDER: 'groq', GROQ_MODEL: 'llama-3.3-70b-versatile' },
      envFile: '',
    });
    expect(cfg.ai.smart.modelId).toBe('llama-3.3-70b-versatile');
    expect(cfg.ai.smart.apiKeyEnv).toBe('GROQ_API_KEY');
  });

  it('AI_<T>_MODEL vence <PROVIDER>_MODEL', () => {
    const cfg = loadCareerOpsConfig({
      env: { AI_SMART_PROVIDER: 'openai', AI_SMART_MODEL: 'gpt-4o', OPENAI_MODEL: 'gpt-4o-mini' },
      envFile: '',
    });
    expect(cfg.ai.smart.modelId).toBe('gpt-4o');
  });

  it('Ollama ganha baseUrl padrão; AI_<T>_BASE_URL e <P>_BASE_URL sobrescrevem', () => {
    const cfg = loadCareerOpsConfig(empty);
    expect(cfg.ai.local.baseUrl).toBe('http://localhost:11434');
    const custom = loadCareerOpsConfig({ env: { OLLAMA_BASE_URL: 'http://gpu:11434' }, envFile: '' });
    expect(custom.ai.local.baseUrl).toBe('http://gpu:11434');
  });

  it('EXECUTION_MODE sobrescreve o modo padrão', () => {
    const cfg = loadCareerOpsConfig({ env: { EXECUTION_MODE: 'FULL_AUTO' }, envFile: '' });
    expect(cfg.execution.mode).toBe('FULL_AUTO');
  });
});

describe('parseEnvFile', () => {
  it('lê KEY=VALUE, ignora comentários e remove aspas', () => {
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

  it('arquivo inexistente → mapa vazio', () => {
    expect(parseEnvFile('nao-existe.env')).toEqual({});
  });
});
