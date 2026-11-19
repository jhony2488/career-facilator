import { resolveModel } from '../../../src/ai/router';
import { makeConfig } from '../../helpers/factories';

describe('resolveModel — roteamento híbrido por camada', () => {
  const config = makeConfig();

  it('resolve a camada LOCAL para a triagem barata primeiro', () => {
    // doc 03: triagem prefere modelos locais quantizados (Ollama)
    const model = resolveModel('LOCAL', config);
    expect(model.provider).toMatch(/ollama|local|onnx/i);
  });

  it('resolve a camada FAST para fallback rápido em nuvem', () => {
    // doc 03: fallback para APIs ultra-rápidas (Groq / Flash-Lite)
    const model = resolveModel('FAST', config);
    expect(model.provider).toMatch(/groq|gemini|google/i);
  });

  it('resolve a camada SMART apenas para geração de ativos', () => {
    // doc 03: modelos de raciocínio só para vagas aprovadas
    const model = resolveModel('SMART', config);
    expect(model.provider).toMatch(/anthropic|claude|gemini|openai/i);
  });

  it('cada camada resolve um modelId diferente', () => {
    const local = resolveModel('LOCAL', config);
    const fast = resolveModel('FAST', config);
    const smart = resolveModel('SMART', config);

    const ids = new Set([local.modelId, fast.modelId, smart.modelId]);
    expect(ids.size).toBe(3);
  });
});
