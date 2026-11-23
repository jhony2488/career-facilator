import { getTask, killTask, listTasks, startTask } from '../../../src/ui/tasks';

describe('ui/tasks (task runner policy)', () => {
  it('rejects empty argv and UI-owning commands', () => {
    for (const argv of [[], ['ui'], ['serve'], ['exit'], ['repl'], ['shell']]) {
      expect(() => startTask(argv)).toThrow(/indisponível|tasks/i);
    }
  });

  it('getTask/listTasks return undefined/empty for unknown ids', () => {
    expect(getTask('nope')).toBeUndefined();
    expect(listTasks()).toEqual([]);
    expect(killTask('nope')).toBe(false);
  });

  it('spawns a real subprocess and captures output + exit', async () => {
    // 'status' runs in both dev (tsx) and SEA — quick and safe.
    const task = startTask(['status']);
    expect(task.status).toBe('running');
    const done = await new Promise<number>((resolveP) => {
      const poll = setInterval(() => {
        const t = getTask(task.id);
        if (t && t.status !== 'running') {
          clearInterval(poll);
          resolveP(t.exitCode ?? -1);
        }
      }, 200);
    });
    expect(done).toBe(0);
    expect(listTasks().map((t) => t.id)).toContain(task.id);
  }, 30_000);
});
