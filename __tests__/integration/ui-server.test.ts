import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveUi, type ServeUiOptions } from '../../src/ui/index';
import type { UiServerHandle } from '../../src/ui/server';

let server: UiServerHandle;
let home: string;
let savedHome: string | undefined;

const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(`${server.url.split('?')[0]}api/${path}`, {
    ...opts,
    headers: { 'X-UI-Token': server.token, 'content-type': 'application/json' },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'cf-ui-home-'));
  savedHome = process.env.CAREER_HOME;
  process.env.CAREER_HOME = home;
  const opts: ServeUiOptions = { port: 0, open: false };
  server = await serveUi(opts);
}, 20_000);

afterAll(async () => {
  await server.close();
  if (savedHome === undefined) delete process.env.CAREER_HOME;
  else process.env.CAREER_HOME = savedHome;
});

describe('ui server (integration)', () => {
  it('serves the static dashboard shell', async () => {
    const res = await fetch(server.url.split('?')[0]);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('CareerFacilator');
    expect(html).toContain('/app.js');
  });

  it('serves i18n and assets', async () => {
    for (const p of ['app.js', 'style.css', 'i18n/pt.json', 'i18n/en.json']) {
      const res = await fetch(new URL(`/${p}`, server.url).href);
      expect(res.status).toBe(200);
    }
  });

  it('rejects API calls without the session token', async () => {
    const res = await fetch(`${server.url.split('?')[0]}api/meta`);
    expect(res.status).toBe(401);
  });

  it('returns meta with the isolated CAREER_HOME', async () => {
    const { status, body } = await api('meta');
    expect(status).toBe(200);
    expect(body.home).toBe(home);
    expect(body.sea).toBe(false);
    expect(body.dbPath).toContain(join(home, 'storage'));
  });

  it('writes env keys to the HOME .env (roundtrip)', async () => {
    const put = await api('env/UI_TEST_FLAG', {
      method: 'PUT',
      body: JSON.stringify({ value: 'xyz-1' }),
    });
    expect(put.status).toBe(200);
    const { body } = await api('env');
    const entry = body.entries.find((e: { key: string }) => e.key === 'UI_TEST_FLAG');
    expect(entry).toMatchObject({ value: 'xyz-1', source: 'home' });
    const del = await api('env/UI_TEST_FLAG', { method: 'DELETE' });
    expect(del.status).toBe(200);
    const after = await api('env');
    expect(after.body.entries.some((e: { key: string }) => e.key === 'UI_TEST_FLAG')).toBe(false);
  });

  it('returns empty status and jobs on a fresh home', async () => {
    expect((await api('status')).body).toMatchObject({ total: 0, counts: {} });
    expect((await api('jobs')).body.jobs).toEqual([]);
    expect((await api('jobs/queue')).body).toMatchObject({ human: [], review: [] });
  });

  it('vault PUT stores a credential and list returns only refs', async () => {
    await api('vault/smtp-main', {
      method: 'PUT',
      body: JSON.stringify({ secret: '{"host":"smtp.local","pass":"s3cr3t"}' }),
    });
    const { body } = await api('vault');
    expect(body.refs).toContain('smtp-main');
    expect(JSON.stringify(body)).not.toContain('s3cr3t');
    await api('vault/smtp-main', { method: 'DELETE' });
    expect((await api('vault')).body.refs).not.toContain('smtp-main');
  });

  it('runs a subprocess task and streams output via SSE', async () => {
    const { status, body } = await api('tasks', {
      method: 'POST',
      body: JSON.stringify({ argv: ['status'] }),
    });
    expect(status).toBe(201);
    const taskId = body.task.id;
    // Poll for completion, then fetch the full buffered stream.
    const deadline = Date.now() + 30_000;
    let task = body.task;
    while (task.status === 'running' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 300));
      task = (await api('tasks')).body.tasks.find((t: { id: string }) => t.id === taskId);
    }
    expect(task.status).toBe('done');
    const sse = await fetch(
      `${server.url.split('?')[0]}api/tasks/${taskId}/events?token=${server.token}`,
    );
    const text = await sse.text();
    expect(text).toContain('vaga(s) no banco');
    expect(text).toContain('exit 0');
  }, 40_000);
});
