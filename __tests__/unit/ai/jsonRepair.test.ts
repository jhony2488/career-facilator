import { z } from 'zod';
import { extractJson, generateStructured } from '../../../src/ai/jsonRepair';

const schema = z.object({ ok: z.boolean(), n: z.number() });

describe('extractJson', () => {
  it('extracts a pure JSON object', () => {
    expect(extractJson('{"ok":true,"n":1}')).toEqual({ ok: true, n: 1 });
  });

  it('extracts JSON inside a markdown fence', () => {
    expect(extractJson('```json\n{"ok":true,"n":2}\n```')).toEqual({ ok: true, n: 2 });
  });

  it('tolerates prose before/after (typical of 3B models)', () => {
    expect(extractJson('Aqui está: {"ok":true,"n":3} Fim.')).toEqual({ ok: true, n: 3 });
  });

  it('stops at the first balanced object — ignores the rest', () => {
    expect(extractJson('{"ok":true,"n":4} {"lixo":1}')).toEqual({ ok: true, n: 4 });
  });

  it('respects braces inside strings', () => {
    const out = extractJson('{"ok":true,"n":5,"extra":"{não conta}"}');
    expect(out).toEqual({ ok: true, n: 5, extra: '{não conta}' });
  });

  it('no JSON object → error', () => {
    expect(() => extractJson('só texto')).toThrow('Nenhum objeto JSON');
  });
});

describe('generateStructured', () => {
  it('valid parse on 1st attempt — no retry', async () => {
    const call = jest.fn().mockResolvedValue('{"ok":true,"n":1}');
    const out = await generateStructured(call, 'p', schema);
    expect(out).toEqual({ ok: true, n: 1 });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('invalid JSON → 1 retry with corrective prompt containing the error', async () => {
    const call = jest
      .fn()
      .mockResolvedValueOnce('isso não é json')
      .mockResolvedValueOnce('{"ok":true,"n":2}');
    const out = await generateStructured(call, 'p', schema);
    expect(out).toEqual({ ok: true, n: 2 });
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[1][0]).toContain('previous output was invalid');
  });

  it('Zod schema violated → retry too', async () => {
    const call = jest
      .fn()
      .mockResolvedValueOnce('{"ok":"não é bool","n":1}')
      .mockResolvedValueOnce('{"ok":true,"n":9}');
    expect(await generateStructured(call, 'p', schema)).toEqual({ ok: true, n: 9 });
  });

  it('exhausts retries → throws last error', async () => {
    const call = jest.fn().mockResolvedValue('sempre inválido');
    await expect(generateStructured(call, 'p', schema, { maxRetries: 1 })).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(2);
  });
});
