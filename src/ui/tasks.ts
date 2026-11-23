import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { packageRoot } from '../config/paths';
import { isSea } from '../utils/runtimeModules';

/**
 * Runner de comandos da UI. Em vez de duplicar a lógica do CLI monólito, cada
 * task spawna o próprio binário (SEA) ou `tsx src/cli/index.ts` (dev) com os
 * mesmos argumentos — saída stdout/stderr é transmitida por SSE e stdin pode
 * ser alimentado (perguntas interativas do `review`, `vault set` etc.).
 */
export interface UiTask {
  id: string;
  argv: string[];
  status: 'running' | 'done' | 'error' | 'killed';
  startedAt: string;
  finishedAt?: string;
  exitCode: number | null;
}

interface LiveTask {
  info: UiTask;
  proc: ChildProcess;
  buffer: string;
  listeners: Set<(chunk: string) => void>;
  closeListeners: Set<() => void>;
}

const BUF_MAX = 300_000;
const MAX_TASKS = 50;
const tasks = new Map<string, LiveTask>();

function emit(t: LiveTask, chunk: string): void {
  t.buffer += chunk;
  if (t.buffer.length > BUF_MAX) t.buffer = t.buffer.slice(-BUF_MAX);
  for (const fn of t.listeners) fn(chunk);
}

export function startTask(argv: string[]): UiTask {
  if (tasks.size >= MAX_TASKS) throw new Error('Limite de tasks em execução');
  // Comandos destrutivos/perigosos não fazem sentido via UI.
  const forbidden = new Set(['exit', 'serve', 'ui', 'shell', 'repl']);
  if (!argv.length || forbidden.has(argv[0])) {
    throw new Error(`Comando indisponível na UI: ${argv[0] ?? '(vazio)'}`);
  }
  const id = randomUUID();
  const proc = isSea()
    ? spawn(process.execPath, argv, { stdio: ['pipe', 'pipe', 'pipe'] })
    : spawn(process.execPath, ['--import', 'tsx', 'src/cli/index.ts', ...argv], {
        cwd: packageRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
  const live: LiveTask = {
    info: {
      id,
      argv,
      status: 'running',
      startedAt: new Date().toISOString(),
      exitCode: null,
    },
    proc,
    buffer: '',
    listeners: new Set(),
    closeListeners: new Set(),
  };
  tasks.set(id, live);
  proc.stdout?.on('data', (d: Buffer) => emit(live, d.toString('utf8')));
  proc.stderr?.on('data', (d: Buffer) => emit(live, d.toString('utf8')));
  proc.on('error', (e) => {
    emit(live, `\n[falha ao iniciar: ${e.message}]\n`);
    live.info.status = 'error';
    live.info.finishedAt = new Date().toISOString();
    for (const fn of live.closeListeners) fn();
  });
  proc.on('close', (code) => {
    live.info.exitCode = code;
    live.info.status = live.info.status === 'killed' ? 'killed' : code === 0 ? 'done' : 'error';
    live.info.finishedAt = new Date().toISOString();
    emit(live, `\n[fim — exit ${code ?? 'null'}]\n`);
    for (const fn of live.closeListeners) fn();
  });
  return live.info;
}

export function getTask(id: string): UiTask | undefined {
  return tasks.get(id)?.info;
}

export function listTasks(): UiTask[] {
  return [...tasks.values()].map((t) => t.info).reverse();
}

export function taskInput(id: string, data: string): boolean {
  const t = tasks.get(id);
  if (!t || t.info.status !== 'running' || !t.proc.stdin?.writable) return false;
  t.proc.stdin.write(data);
  return true;
}

export function killTask(id: string): boolean {
  const t = tasks.get(id);
  if (!t || t.info.status !== 'running') return false;
  t.info.status = 'killed';
  t.proc.kill('SIGINT');
  return true;
}

/**
 * Assina o stream de saída de uma task. Recebe primeiro o buffer acumulado
 * (replay) e depois os chunks novos; `onClose` dispara no fim do processo.
 */
export function subscribeTask(
  id: string,
  onData: (chunk: string) => void,
  onClose: () => void,
): (() => void) | null {
  const t = tasks.get(id);
  if (!t) return null;
  if (t.buffer) onData(t.buffer);
  if (t.info.status !== 'running') {
    onClose();
    return () => {};
  }
  t.listeners.add(onData);
  t.closeListeners.add(onClose);
  return () => {
    t.listeners.delete(onData);
    t.closeListeners.delete(onClose);
  };
}
