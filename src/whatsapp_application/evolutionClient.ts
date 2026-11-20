/**
 * Cliente da Evolution API (doc 15): REST self-hosted — a instância e a
 * apikey vivem em env (`EVOLUTION_API_URL`/`EVOLUTION_API_KEY`), nunca
 * em config ou log. REST puro via fetch nativo — sem dependência extra.
 */
export interface EvolutionTransport {
  /** POST /message/sendText/{instance} */
  sendText(number: string, text: string): Promise<{ messageId: string }>;
  /** POST /message/sendMedia/{instance} — documento PDF em base64. */
  sendDocument(
    number: string,
    pdfBase64: string,
    fileName: string,
    caption?: string,
  ): Promise<{ messageId: string }>;
}

export interface EvolutionClientDeps {
  apiUrl: string;
  apiKey: string;
  instance: string;
  /** Injetável p/ testes — default é o fetch global. */
  fetchImpl?: typeof fetch;
}

export function createEvolutionClient(deps: EvolutionClientDeps): EvolutionTransport {
  const call = deps.fetchImpl ?? fetch;
  const base = deps.apiUrl.replace(/\/+$/, '');

  async function post(path: string, body: Record<string, unknown>): Promise<{ messageId: string }> {
    const res = await call(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: deps.apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Evolution API ${path}: HTTP ${res.status}`);
    }
    const data = (await res.json()) as { key?: { id?: string } };
    return { messageId: data.key?.id ?? '' };
  }

  return {
    sendText: (number, text) =>
      post(`/message/sendText/${deps.instance}`, { number, text }),

    sendDocument: (number, pdfBase64, fileName, caption) =>
      post(`/message/sendMedia/${deps.instance}`, {
        number,
        mediatype: 'document',
        mimetype: 'application/pdf',
        media: pdfBase64,
        fileName,
        ...(caption ? { caption } : {}),
      }),
  };
}
