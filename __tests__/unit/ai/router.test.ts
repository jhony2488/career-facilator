import { resolveModel } from '../../../src/ai/router';
import { makeConfig } from '../../helpers/factories';

describe('resolveModel — hybrid per-tier routing', () => {
  const config = makeConfig();

  it('resolves the LOCAL tier for cheap triage first', () => {
    // doc 03: triage prefers quantized local models (Ollama)
    const model = resolveModel('LOCAL', config);
    expect(model.provider).toMatch(/ollama|local|onnx/i);
  });

  it('resolves the FAST tier for quick cloud fallback', () => {
    // doc 03: fallback to ultra-fast APIs (Groq / Flash-Lite)
    const model = resolveModel('FAST', config);
    expect(model.provider).toMatch(/groq|gemini|google/i);
  });

  it('resolves the SMART tier only for asset generation', () => {
    // doc 03: reasoning models only for approved jobs
    const model = resolveModel('SMART', config);
    expect(model.provider).toMatch(/anthropic|claude|gemini|openai/i);
  });

  it('each tier resolves a different modelId', () => {
    const local = resolveModel('LOCAL', config);
    const fast = resolveModel('FAST', config);
    const smart = resolveModel('SMART', config);

    const ids = new Set([local.modelId, fast.modelId, smart.modelId]);
    expect(ids.size).toBe(3);
  });
});
