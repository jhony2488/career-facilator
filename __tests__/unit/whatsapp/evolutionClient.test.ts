import {
  createEvolutionSetup,
  createEvolutionClient,
} from '../../../src/whatsapp_application/evolutionClient';

/** fetch stub that records calls and returns canned JSON per path. */
function stubFetch(responses: Record<string, unknown>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const body = Object.entries(responses).find(([path]) => String(url).includes(path))?.[1];
    return {
      ok: true,
      json: async () => body ?? {},
    } as Response;
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

describe('createEvolutionSetup — instance provisioning (doc 15)', () => {
  const deps = { apiUrl: 'http://evo.local:8080/', apiKey: 'secret-key' };

  it('creates an instance with QR enabled and baileys integration', async () => {
    const { fetchImpl, calls } = stubFetch({
      '/instance/create': { instance: { instanceName: 'career-bot' } },
    });
    const setup = createEvolutionSetup({ ...deps, fetchImpl });

    const result = await setup.createInstance('career-bot');

    expect(result.instanceName).toBe('career-bot');
    expect(calls[0].url).toBe('http://evo.local:8080/instance/create');
    expect(JSON.parse(calls[0].init!.body as string)).toMatchObject({
      instanceName: 'career-bot',
      qrcode: true,
    });
    expect((calls[0].init!.headers as Record<string, string>).apikey).toBe('secret-key');
  });

  it('fetches the QR payload for terminal rendering', async () => {
    const { fetchImpl } = stubFetch({
      '/instance/connect': { code: '2@qr-payload', pairingCode: 'ABCD-1234' },
    });
    const setup = createEvolutionSetup({ ...deps, fetchImpl });

    const qr = await setup.getConnectionQr('career-bot');

    expect(qr.code).toBe('2@qr-payload');
    expect(qr.pairingCode).toBe('ABCD-1234');
  });

  it('reports the connection state of an instance', async () => {
    const { fetchImpl, calls } = stubFetch({
      '/instance/connectionState': { instance: { state: 'open' } },
    });
    const setup = createEvolutionSetup({ ...deps, fetchImpl });

    expect(await setup.getConnectionState('career-bot')).toBe('open');
    expect(calls[0].url).toContain('/instance/connectionState/career-bot');
  });

  it('surfaces API errors with the path and status', async () => {
    const fetchImpl = jest.fn(
      async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response,
    );
    const setup = createEvolutionSetup({
      ...deps,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(setup.getConnectionState('x')).rejects.toThrow('HTTP 503');
  });
});

describe('createEvolutionClient — send endpoints (doc 15)', () => {
  it('posts sendText and sendMedia payloads to the instance', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(init!.body as string) });
      return { ok: true, json: async () => ({ key: { id: 'm1' } }) } as Response;
    });
    const client = createEvolutionClient({
      apiUrl: 'http://evo.local:8080',
      apiKey: 'k',
      instance: 'inst1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.sendText('5581999887766', 'Bom dia');
    await client.sendDocument('5581999887766', 'QkFTRTY0', 'cv.pdf', 'Dev');

    expect(calls[0].url).toBe('http://evo.local:8080/message/sendText/inst1');
    expect(calls[0].body).toMatchObject({ number: '5581999887766', text: 'Bom dia' });
    expect(calls[1].url).toBe('http://evo.local:8080/message/sendMedia/inst1');
    expect(calls[1].body).toMatchObject({
      mediatype: 'document',
      mimetype: 'application/pdf',
      media: 'QkFTRTY0',
      fileName: 'cv.pdf',
      caption: 'Dev',
    });
  });
});
