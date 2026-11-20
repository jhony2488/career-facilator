import { z } from 'zod';
import { extractJson, generateStructured } from '../../../src/ai/jsonRepair';

const schema = z.object({ ok: z.boolean(), n: z.number() });

describe('extractJson', () => {
  it('extrai objeto JSON puro', () => {
    expect(extractJson('{"ok":true,"n":1}')).toEqual({ ok: true, n: 1 });
  });

  it('extrai JSON dentro de fence markdown', () => {
    expect(extractJson('```json\n{"ok":true,"n":2}\n```')).toEqual({ ok: true, n: 2 });
  });

  it('tolera prosa antes/depois (padrão em modelos 3B)', () => {
    expect(extractJson('Aqui está: {"ok":true,"n":3} Fim.')).toEqual({ ok: true, n: 3 });
  });

  it('para no primeiro objeto balanceado — ignora resto', () => {
    expect(extractJson('{"ok":true,"n":4} {"lixo":1}')).toEqual({ ok: true, n: 4 });
  });

  it('respeita chaves dentro de strings', () => {
    const out = extractJson('{"ok":true,"n":5,"extra":"{não conta}"}');
    expect(out).toEqual({ ok: true, n: 5, extra: '{não conta}' });
  });

  it('sem objeto JSON → erro', () => {
    expect(() => extractJson('só texto')).toThrow('Nenhum objeto JSON');
  });
});

describe('generateStructured', () => {
  it('parse válido na 1ª tentativa — sem retry', async () => {
    const call = jest.fn().mockResolvedValue('{"ok":true,"n":1}');
    const out = await generateStructured(call, 'p', schema);
    expect(out).toEqual({ ok: true, n: 1 });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('JSON inválido → 1 retry com prompt corretivo contendo o erro', async () => {
    const call = jest
      .fn()
      .mockResolvedValueOnce('isso não é json')
      .mockResolvedValueOnce('{"ok":true,"n":2}');
    const out = await generateStructured(call, 'p', schema);
    expect(out).toEqual({ ok: true, n: 2 });
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[1][0]).toContain('previous output was invalid');
  });

  it('schema Zod violado → retry também', async () => {
    const call = jest
      .fn()
      .mockResolvedValueOnce('{"ok":"não é bool","n":1}')
      .mockResolvedValueOnce('{"ok":true,"n":9}');
    expect(await generateStructured(call, 'p', schema)).toEqual({ ok: true, n: 9 });
  });

  it('esgota retries → lança último erro', async () => {
    const call = jest.fn().mockResolvedValue('sempre inválido');
    await expect(generateStructured(call, 'p', schema, { maxRetries: 1 })).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(2);
  });
});
