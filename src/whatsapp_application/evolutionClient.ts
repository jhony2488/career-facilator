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

/** Resposta de /instance/connect: `code` é o payload do QR (vai pro terminal). */
export interface EvolutionQr {
  code?: string;
  pairingCode?: string;
}

/**
 * Setup da instância Evolution API (doc 15 §15.3): criar instância, obter QR
 * de pareamento e consultar o estado da conexão.
 */
export interface EvolutionSetup {
  createInstance(name: string): Promise<{ instanceName: string }>;
  getConnectionQr(name: string): Promise<EvolutionQr>;
  getConnectionState(name: string): Promise<string>;
}

export interface EvolutionSetupDeps {
  apiUrl: string;
  apiKey: string;
  /** Injetável p/ testes — default é o fetch global. */
  fetchImpl?: typeof fetch;
}

export function createEvolutionSetup(deps: EvolutionSetupDeps): EvolutionSetup {
  const call = deps.fetchImpl ?? fetch;
  const base = deps.apiUrl.replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json', apikey: deps.apiKey };

  async function request(method: string, path: string, body?: Record<string, unknown>) {
    const res = await call(`${base}${path}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      throw new Error(`Evolution API ${path}: HTTP ${res.status}`);
    }
    return res.json() as Promise<Record<string, unknown>>;
  }

  return {
    createInstance: async (name) => {
      const data = await request('POST', '/instance/create', {
        instanceName: name,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      });
      const instance = (data.instance ?? {}) as { instanceName?: string };
      return { instanceName: instance.instanceName ?? name };
    },

    getConnectionQr: async (name) => {
      const data = await request('GET', `/instance/connect/${name}`);
      return {
        code: data.code as string | undefined,
        pairingCode: data.pairingCode as string | undefined,
      };
    },

    getConnectionState: async (name) => {
      const data = await request('GET', `/instance/connectionState/${name}`);
      const instance = (data.instance ?? {}) as { state?: string };
      return instance.state ?? 'unknown';
    },
  };
}
