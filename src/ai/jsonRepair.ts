import type { z } from 'zod';

/**
 * Extrai o primeiro objeto JSON balanceado de um texto — tolera fences
 * ```json ... ``` e prosa antes/depois (comum em modelos 3B).
 */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?\s*/gi, '').trim();
  const start = cleaned.indexOf('{');
  if (start === -1) throw new Error('Nenhum objeto JSON encontrado na saída do modelo');

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
    }
  }
  throw new Error('Objeto JSON não fechado na saída do modelo');
}

export interface StructuredCall {
  (prompt: string): Promise<unknown>;
}

/**
 * Gera saída estruturada com validação Zod e 1 retry corretivo:
 * se o parse falhar, re-prompta informando o erro e exigindo JSON puro —
 * padrão essencial para modelos pequenos (3B) que falham esporadicamente.
 */
export async function generateStructured<T>(
  call: StructuredCall,
  prompt: string,
  schema: z.ZodType<T>,
  opts: { maxRetries?: number } = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 1;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const effectivePrompt =
      attempt === 0
        ? prompt
        : [
            prompt,
            '',
            `Your previous output was invalid: ${lastError?.message ?? 'parse error'}.`,
            'Return ONLY a valid JSON object matching the required schema. No prose.',
          ].join('\n');

    const raw = await call(effectivePrompt);
    try {
      const parsed = extractJson(typeof raw === 'string' ? raw : JSON.stringify(raw));
      return schema.parse(parsed);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error('Falha ao gerar saída estruturada');
}
