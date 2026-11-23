import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadCareerOpsConfig, loadEffectiveEnv } from '../config/loadConfig';
import { careerHome, resolveHome, packageRoot, type HomeAnchor } from '../config/paths';
import { setEnvKey, unsetEnvKey } from '../config/envFile';
import {
  isSea,
  loadRuntimeModule,
  runtimeDir,
  runtimeDirCandidates,
  tessdataDir,
} from '../utils/runtimeModules';
import { JobRepository } from '../db/repository';
import { FileCredentialVault } from '../email_application/credentialVault';
import { compileMasterProfile } from '../intake/profileCompiler';
import { listEnvEntries } from './envMap';
import { parseEnvExample, readEnvExample } from './envExample';
import { parseEnvFile } from '../config/loadConfig';
import { getTask, killTask, listTasks, startTask, subscribeTask, taskInput } from './tasks';
import { tokenOk } from './auth';

/**
 * Rotas /api da UI local. Leituras estruturadas rodam in-process (repo, env,
 * vault, perfil); comandos viram tasks — subprocesso do próprio binário com
 * stdout→SSE e stdin alimentável (paridade total com o CLI).
 */
export interface ApiDeps {
  exeDir?: string;
  token: string;
}

const JSON_CT = 'application/json; charset=utf-8';

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': JSON_CT });
  res.end(data);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

function version(): string {
  if (process.env.CAREER_VERSION) return process.env.CAREER_VERSION;
  try {
    const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? 'dev';
  } catch {
    return 'dev';
  }
}

const SEG = /^\/api(?:\/([^/?]+))?(?:\/([^/?]+))?(?:\/([^/?]+))?/;
const MARKS = new Set([
  'applied',
  'email',
  'whatsapp',
  'skipped',
  'failed',
  'rejected',
  'interview',
  'assessment',
]);
const MARK_TO_STATUS: Record<string, string> = {
  applied: 'APPLIED',
  email: 'APPLIED_VIA_EMAIL',
  whatsapp: 'APPLIED_VIA_WHATSAPP',
  skipped: 'SKIPPED',
  failed: 'FAILED',
  rejected: 'REJECTED',
  interview: 'INTERVIEW',
  assessment: 'ASSESSMENT_INVITED',
};

export async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  deps: ApiDeps,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (!url.pathname.startsWith('/api/') && url.pathname !== '/api') return false;
  if (!tokenOk(req, deps.token)) {
    json(res, 401, { error: 'unauthorized' });
    return true;
  }
  const m = SEG.exec(url.pathname);
  const [, a, b, c] = m ?? [];
  const method = req.method ?? 'GET';
  const seaOpts: HomeAnchor = { exeDir: deps.exeDir };
  const env = () => loadEffectiveEnv(seaOpts);
  const home = () => careerHome(env().env, seaOpts);
  const config = () => loadCareerOpsConfig(seaOpts);
  const dbPath = () =>
    env().env.JOBS_DB_PATH ?? resolveHome('storage/jobs.sqlite', env().env, seaOpts);
  const openRepo = () => {
    const p = dbPath();
    mkdirSync(dirname(p), { recursive: true });
    return new JobRepository(p);
  };
  const vault = () =>
    new FileCredentialVault(
      resolveHome('vault', env().env, seaOpts),
      env().env.CAREER_VAULT_SECRET,
      ['dev-only-insecure-key'],
    );

  try {
    // ── Meta ──────────────────────────────────────────────────────────────
    if (method === 'GET' && a === 'meta') {
      json(res, 200, {
        version: version(),
        sea: isSea(),
        platform: `${process.platform}-${process.arch}`,
        home: home(),
        dbPath: dbPath(),
        exeDir: deps.exeDir ?? null,
        cwd: process.cwd(),
      });
      return true;
    }

    // ── Env (config) ──────────────────────────────────────────────────────
    if (a === 'env') {
      if (method === 'GET' && b === 'example') {
        const content = readEnvExample();
        json(res, content ? 200 : 404, content ? { sections: parseEnvExample(content) } : {});
        return true;
      }
      if (method === 'POST' && b === 'import') {
        const body = (await readBody(req)) as { content?: string };
        if (typeof body.content !== 'string' || !body.content.trim()) {
          json(res, 400, { error: 'campo "content" (conteúdo do .env) obrigatório' });
          return true;
        }
        // Reaproveita o parser do app — ignora comentários/linhas inválidas.
        const tmp = join(home(), `.ui-import-${Date.now()}.env`);
        writeFileSync(tmp, body.content, 'utf8');
        const parsed = parseEnvFile(tmp);
        rmSync(tmp, { force: true });
        const file = env().homeEnvFile;
        let applied = 0;
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v !== 'string') continue;
          setEnvKey(file, k, v);
          applied++;
        }
        json(res, 200, { ok: true, applied, file });
        return true;
      }
      if (method === 'GET') {
        json(res, 200, listEnvEntries(seaOpts));
        return true;
      }
      if (method === 'PUT' && b) {
        const body = (await readBody(req)) as { value?: string };
        setEnvKey(env().homeEnvFile, decodeURIComponent(b), String(body.value ?? ''));
        json(res, 200, { ok: true });
        return true;
      }
      if (method === 'DELETE' && b) {
        unsetEnvKey(env().homeEnvFile, decodeURIComponent(b));
        json(res, 200, { ok: true });
        return true;
      }
    }

    // ── Runtime ───────────────────────────────────────────────────────────
    if (method === 'GET' && a === 'runtime') {
      const dir = runtimeDir();
      const skillsPresent =
        existsSync(join(deps.exeDir ?? packageRoot, 'skills')) ||
        existsSync(join(packageRoot, 'src/skills/library'));
      let playwright = false;
      try {
        await loadRuntimeModule('playwright');
        playwright = true;
      } catch {
        /* indisponível */
      }
      json(res, 200, {
        runtimeDir: dir,
        candidates: runtimeDirCandidates(),
        nodeModules: Boolean(dir && existsSync(join(dir, 'node_modules'))),
        browsers: Boolean(dir && existsSync(join(dir, 'browsers'))),
        tessdata: tessdataDir() !== null,
        skills: skillsPresent,
        playwright,
        sea: isSea(),
      });
      return true;
    }

    // ── Jobs / status ─────────────────────────────────────────────────────
    if (method === 'GET' && a === 'status') {
      const repo = openRepo();
      try {
        const counts = await repo.countByStatus();
        json(res, 200, { counts, total: Object.values(counts).reduce((x, y) => x + y, 0) });
      } finally {
        repo.close();
      }
      return true;
    }
    if (a === 'jobs' && method === 'GET' && !b) {
      const repo = openRepo();
      try {
        const status = url.searchParams.get('status');
        const q = (url.searchParams.get('q') ?? '').toLowerCase();
        const limit = Math.min(500, Number(url.searchParams.get('limit') ?? '200'));
        let jobs = status
          ? await repo.listByStatus(status as never)
          : await repo.listApplied(limit);
        if (q) {
          jobs = jobs.filter((j) =>
            `${j.url} ${j.company ?? ''} ${j.title ?? ''}`.toLowerCase().includes(q),
          );
        }
        json(res, 200, { jobs: jobs.slice(0, limit) });
      } finally {
        repo.close();
      }
      return true;
    }
    if (a === 'jobs' && b === 'queue' && method === 'GET') {
      const repo = openRepo();
      try {
        const [human, review, whatsapp] = await Promise.all([
          repo.listByStatus('NEEDS_HUMAN_INPUT'),
          repo.listByStatus('READY_TO_REVIEW'),
          repo.listWhatsappQueue(),
        ]);
        json(res, 200, { human, review, whatsapp });
      } finally {
        repo.close();
      }
      return true;
    }
    if (a === 'jobs' && b && c === 'status' && method === 'POST') {
      const body = (await readBody(req)) as { status?: string };
      const mark = (body.status ?? '').toLowerCase();
      if (!MARKS.has(mark)) {
        json(res, 400, { error: `status inválido — use: ${[...MARKS].join('|')}` });
        return true;
      }
      const repo = openRepo();
      try {
        const job = await repo.findJob(decodeURIComponent(b));
        if (!job) {
          json(res, 404, { error: 'vaga não encontrada' });
          return true;
        }
        const channel = { email: 'EMAIL', whatsapp: 'WHATSAPP' }[mark] as
          'EMAIL' | 'WHATSAPP' | undefined;
        if (channel) await repo.markChannelSent(job.id, channel);
        await repo.updateStatus(job.url, MARK_TO_STATUS[mark] as never);
        json(res, 200, { ok: true, status: MARK_TO_STATUS[mark] });
      } finally {
        repo.close();
      }
      return true;
    }
    if (a === 'jobs' && b && c === 'remove' && method === 'POST') {
      const repo = openRepo();
      try {
        json(res, 200, { ok: await repo.deleteJob(decodeURIComponent(b)) });
      } finally {
        repo.close();
      }
      return true;
    }

    // ── Tasks (comandos via subprocesso + SSE) ────────────────────────────
    if (a === 'tasks') {
      if (method === 'GET' && !b) {
        json(res, 200, { tasks: listTasks() });
        return true;
      }
      if (method === 'POST' && !b) {
        const body = (await readBody(req)) as { argv?: string[] };
        if (!Array.isArray(body.argv) || !body.argv.every((s) => typeof s === 'string')) {
          json(res, 400, { error: 'argv deve ser string[]' });
          return true;
        }
        const task = startTask(body.argv);
        json(res, 201, { task });
        return true;
      }
      if (b && c === 'events' && method === 'GET') {
        const task = getTask(b);
        if (!task) {
          json(res, 404, { error: 'task inexistente' });
          return true;
        }
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        const send = (chunk: string) => {
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        };
        const end = () => {
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
        };
        const unsub = subscribeTask(b, send, end) ?? (() => {});
        req.on('close', unsub);
        return true;
      }
      if (b && c === 'input' && method === 'POST') {
        const body = (await readBody(req)) as { data?: string };
        json(res, taskInput(b, String(body.data ?? '')) ? 200 : 409, {});
        return true;
      }
      if (b && c === 'kill' && method === 'POST') {
        json(res, killTask(b) ? 200 : 409, {});
        return true;
      }
    }

    // ── Vault (refs apenas — nunca segredos) ──────────────────────────────
    if (a === 'vault') {
      if (method === 'GET') {
        json(res, 200, { refs: await vault().list() });
        return true;
      }
      if (method === 'PUT' && b) {
        const body = (await readBody(req)) as { secret?: string };
        if (typeof body.secret !== 'string' || !body.secret) {
          json(res, 400, { error: 'campo "secret" (JSON string) obrigatório' });
          return true;
        }
        await vault().setCredential(decodeURIComponent(b), body.secret);
        json(res, 200, { ok: true });
        return true;
      }
      if (method === 'DELETE' && b) {
        json(res, 200, { ok: await vault().remove(decodeURIComponent(b)) });
        return true;
      }
    }

    // ── Perfil ────────────────────────────────────────────────────────────
    if (a === 'profile') {
      const cfg = config();
      if (method === 'GET' && !b) {
        json(res, 200, {
          masterPath: cfg.profile.masterPath,
          compiledPath: cfg.profile.compiledPath,
          inboxDir: cfg.profile.inboxDir,
          master: existsSync(cfg.profile.masterPath)
            ? readFileSync(cfg.profile.masterPath, 'utf8')
            : null,
          draft: existsSync(cfg.profile.draftPath)
            ? readFileSync(cfg.profile.draftPath, 'utf8')
            : null,
        });
        return true;
      }
      if (method === 'PUT' && !b) {
        const body = (await readBody(req)) as { markdown?: string };
        if (typeof body.markdown !== 'string' || !body.markdown.trim()) {
          json(res, 400, { error: 'campo "markdown" obrigatório' });
          return true;
        }
        const { profile, warnings } = compileMasterProfile(body.markdown);
        mkdirSync(dirname(cfg.profile.masterPath), { recursive: true });
        writeFileSync(cfg.profile.masterPath, body.markdown, 'utf8');
        try {
          writeFileSync(
            cfg.profile.compiledPath,
            JSON.stringify(
              { version: 1, generatedAt: new Date().toISOString(), ...profile },
              null,
              2,
            ),
            'utf8',
          );
        } catch {
          /* artefato derivado — não bloqueia */
        }
        json(res, 200, { ok: true, warnings });
        return true;
      }
      if (method === 'POST' && b === 'import') {
        const body = (await readBody(req)) as { name?: string; dataB64?: string };
        const name = basename(body.name ?? 'cv.pdf').replace(/[^\w.-]/g, '_');
        if (!body.dataB64) {
          json(res, 400, { error: 'campo "dataB64" (PDF em base64) obrigatório' });
          return true;
        }
        const dir = cfg.profile.inboxDir;
        mkdirSync(dir, { recursive: true });
        const dest = join(dir, name);
        writeFileSync(dest, Buffer.from(body.dataB64, 'base64'));
        json(res, 201, { path: dest });
        return true;
      }
    }

    json(res, 404, { error: `rota não encontrada: ${method} ${url.pathname}` });
    return true;
  } catch (e) {
    json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    return true;
  }
}
