/* CareerFacilator AI — UI local. Vanilla JS, sem build.
 * Token de sessão vem em ?token= na URL e vai no header X-UI-Token. */
'use strict';

// ── infra ──────────────────────────────────────────────────────────────────
const token =
  new URLSearchParams(location.search).get('token') ?? sessionStorage.getItem('ui-token') ?? '';
if (token) sessionStorage.setItem('ui-token', token);
let es = null; // EventSource ativa (terminal)

async function api(path, opts = {}) {
  const res = await fetch(`/api/${path}`, {
    ...opts,
    headers: { 'X-UI-Token': token, 'content-type': 'application/json', ...(opts.headers ?? {}) },
  });
  const body = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

let dict = {};
async function setLang(lang) {
  dict = await fetch(`/i18n/${lang}.json`).then((r) => r.json());
  document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
  localStorage.setItem('ui-lang', lang);
  renderTabs();
  show(current);
}
const t = (k) => dict[k] ?? k;
const el = (tag, attrs = {}, children = []) => {
  const e = Object.assign(document.createElement(tag), { className: attrs.class ?? '' });
  if (attrs.text !== undefined) e.textContent = attrs.text;
  if (attrs.html !== undefined) e.innerHTML = attrs.html;
  for (const [k, v] of Object.entries(attrs.attrs ?? {})) e.setAttribute(k, v);
  for (const c of children) e.append(c);
  return e;
};
const panel = (id) => document.getElementById(`panel-${id}`);
function toast(msg) {
  const d = document.getElementById('toast');
  d.textContent = msg;
  d.classList.remove('hidden');
  setTimeout(() => d.classList.add('hidden'), 2600);
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// ── tabs ───────────────────────────────────────────────────────────────────
const TABS = ['dashboard', 'config', 'jobs', 'queue', 'vault', 'profile', 'runtime', 'terminal'];
let current = 'dashboard';
function renderTabs() {
  document.getElementById('tabs').innerHTML = '';
  for (const id of TABS) {
    const b = el('button', { text: t(`tab.${id}`) });
    if (id === current) b.classList.add('active');
    b.onclick = () => show(id);
    document.getElementById('tabs').append(b);
  }
}
function show(id) {
  current = id;
  for (const t2 of TABS) panel(t2).classList.toggle('hidden', t2 !== id);
  renderTabs();
  RENDER[id]?.();
}

// ── dashboard ──────────────────────────────────────────────────────────────
async function rDash() {
  const p = panel('dashboard');
  p.innerHTML = `<h2>${t('tab.dashboard')}</h2><p class="muted">${t('common.loading')}</p>`;
  const [meta, status, taskList] = await Promise.all([api('meta'), api('status'), api('tasks')]);
  p.innerHTML = '';
  const kv = el('dl', { class: 'kv' }, [
    el('dt', { text: t('dash.version') }),
    el('dd', { text: `${meta.version} ${meta.sea ? '(SEA)' : '(dev)'}` }),
    el('dt', { text: t('dash.platform') }),
    el('dd', { text: meta.platform }),
    el('dt', { text: t('dash.home') }),
    el('dd', { text: meta.home }),
    el('dt', { text: t('dash.db') }),
    el('dd', { text: meta.dbPath }),
    el('dt', { text: meta.exeDir ? t('dash.exe') : t('dash.cwd') }),
    el('dd', { text: meta.exeDir ?? meta.cwd }),
  ]);
  const stats = el(
    'div',
    {},
    Object.entries(status.counts)
      .sort()
      .map(([k, n]) =>
        el('span', { class: 'stat' }, [el('b', { text: String(n) }), el('span', { text: k })]),
      ),
  );
  const rows = taskList.tasks
    .slice(0, 8)
    .map(
      (tk) =>
        `<tr><td class="muted">${tk.startedAt.slice(11, 19)}</td><td>${esc(tk.argv.join(' '))}</td><td><span class="pill ${tk.status === 'done' ? 'ok' : tk.status === 'running' ? 'acc' : 'err'}">${tk.status}</span></td></tr>`,
    )
    .join('');
  p.append(
    el('div', { class: 'card' }, [el('h2', { text: t('dash.meta') }), kv]),
    el('div', { class: 'card' }, [el('h2', { text: t('dash.counts') }), stats]),
    el('div', { class: 'card' }, [
      el('h2', { text: t('dash.tasks') }),
      el('table', { html: rows || `<tr><td class="muted">${t('common.none')}</td></tr>` }),
    ]),
  );
}

// ── config ─────────────────────────────────────────────────────────────────
async function rConfig() {
  const p = panel('config');
  p.innerHTML = `<h2>${t('config.title')}</h2><p class="muted">${t('common.loading')}</p>`;
  const data = await api('env');
  const rows = data.entries
    .map(
      (e) =>
        `<tr><td><code>${esc(e.key)}</code></td><td>${esc(e.value)}</td>` +
        `<td><span class="pill ${e.source === 'process' ? 'warn' : 'acc'}">${e.source}</span></td>` +
        `<td><button data-edit="${esc(e.key)}">${t('act.edit')}</button> ` +
        `<button class="danger" data-del="${esc(e.key)}">${t('act.del')}</button></td></tr>`,
    )
    .join('');
  p.innerHTML = '';
  const files = el('dl', { class: 'kv' }, [
    el('dt', { text: t('config.file_home') }),
    el('dd', { text: data.homeEnvFile }),
    el('dt', { text: t('config.file_cwd') }),
    el('dd', { text: data.cwdEnvFile }),
    ...(data.exeEnvFile
      ? [el('dt', { text: t('config.file_exe') }), el('dd', { text: data.exeEnvFile })]
      : []),
  ]);
  const add = el('button', { class: 'primary', text: t('config.add') });
  add.onclick = async () => {
    const key = prompt(t('config.key_name'));
    if (!key) return;
    const value = prompt(`${t('config.value_for')} ${key}`) ?? '';
    await api(`env/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ value }) });
    toast(t('msg.saved'));
    rConfig();
  };
  const tbl = el('table', {
    html: `<tr><th>${t('config.key')}</th><th>${t('config.value')}</th><th>${t('config.source')}</th><th></th></tr>${rows}`,
  });
  tbl.onclick = async (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    const [key, kind] = btn.dataset.edit ? [btn.dataset.edit, 'edit'] : [btn.dataset.del, 'del'];
    if (kind === 'edit') {
      const value = prompt(`${t('config.value_for')} ${key}`);
      if (value === null) return;
      await api(`env/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      });
      toast(t('msg.saved'));
    } else {
      if (!confirm(`${t('msg.confirm_remove')} ${key}?`)) return;
      await api(`env/${encodeURIComponent(key)}`, { method: 'DELETE' });
      toast(t('msg.deleted'));
    }
    rConfig();
  };
  p.append(
    el('div', { class: 'card' }, [
      el('div', { class: 'row' }, [add]),
      el('p', { class: 'muted', text: t('config.hint') }),
      tbl,
    ]),
    el('div', { class: 'card' }, [el('h2', { text: t('config.files') }), files]),
  );
}

// ── jobs ───────────────────────────────────────────────────────────────────
const STATUSES = [
  '',
  'DISCOVERED',
  'TRIAGED',
  'TAILORED',
  'READY_TO_REVIEW',
  'APPLIED',
  'APPLIED_VIA_EMAIL',
  'APPLIED_VIA_WHATSAPP',
  'NEEDS_HUMAN_INPUT',
  'SKIPPED',
  'FAILED',
  'REJECTED',
  'INTERVIEW',
  'ASSESSMENT_INVITED',
];
async function rJobs() {
  const p = panel('jobs');
  p.innerHTML = `<h2>${t('jobs.title')}</h2>`;
  const sel = el(
    'select',
    {},
    STATUSES.map((s) => el('option', { text: s || t('jobs.all'), attrs: { value: s } })),
  );
  const q = el('input', { attrs: { type: 'text', placeholder: t('jobs.search') } });
  const btn = el('button', { class: 'primary', text: t('jobs.apply') });
  const tbl = el('div');
  btn.onclick = () => loadJobs(sel.value, q.value);
  q.onkeydown = (e) => e.key === 'Enter' && btn.click();
  p.append(el('div', { class: 'card row' }, [sel, q, btn]), el('div', { class: 'card' }, [tbl]));
  async function loadJobs(status, query) {
    tbl.innerHTML = `<p class="muted">${t('common.loading')}</p>`;
    const { jobs } = await api(
      `jobs?limit=300${status ? `&status=${status}` : ''}${query ? `&q=${encodeURIComponent(query)}` : ''}`,
    );
    if (!jobs.length) {
      tbl.innerHTML = `<p class="muted">${t('jobs.empty')}</p>`;
      return;
    }
    tbl.innerHTML = `<table><tr><th>${t('jobs.jobtitle')}</th><th>${t('jobs.company')}</th><th>${t('jobs.status')}</th><th>${t('jobs.score')}</th><th>${t('jobs.actions')}</th></tr>${jobs
      .map(
        (j) =>
          `<tr><td><a href="${esc(j.url)}" target="_blank" style="color:var(--accent)">${esc(j.title ?? j.url)}</a></td>` +
          `<td>${esc(j.company ?? '—')}</td><td><span class="pill">${j.status}</span></td>` +
          `<td>${j.fitScore ?? '—'}</td><td>${actionBtns(j.id)}</td></tr>`,
      )
      .join('')}</table>`;
  }
  tbl.onclick = jobActions(loadJobs, () => [sel.value, q.value]);
  await loadJobs('', '');
}

function actionBtns(id) {
  return (
    ['applied', 'email', 'whatsapp', 'skipped', 'failed']
      .map((s) => `<button data-act="${s}" data-id="${id}">${t(`act.${s}`)}</button>`)
      .join(' ') +
    ` <button class="danger" data-act="remove" data-id="${id}">${t('act.remove')}</button>`
  );
}
function jobActions(reload, params) {
  return async (ev) => {
    const btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    const { act, id } = btn.dataset;
    try {
      if (act === 'remove') {
        if (!confirm(`${t('msg.confirm_remove')} ${id}?`)) return;
        await api(`jobs/${id}/remove`, { method: 'POST' });
      } else {
        await api(`jobs/${id}/status`, { method: 'POST', body: JSON.stringify({ status: act }) });
      }
      toast(t('msg.saved'));
      reload(...params());
    } catch (e) {
      toast(`${t('msg.err')} ${e.message}`);
    }
  };
}

// ── queue ──────────────────────────────────────────────────────────────────
async function rQueue() {
  const p = panel('queue');
  p.innerHTML = `<h2>${t('tab.queue')}</h2><p class="muted">${t('common.loading')}</p>`;
  const { human, review, whatsapp } = await api('jobs/queue');
  p.innerHTML = `<h2>${t('tab.queue')}</h2>`;
  const section = (title, items) => {
    if (!items?.length) return null;
    return el('div', { class: 'card' }, [
      el('h2', { text: title }),
      el('table', {
        html: items
          .map(
            (j) =>
              `<tr><td><a href="${esc(j.url)}" target="_blank" style="color:var(--accent)">${esc(j.title ?? j.url)}</a></td>` +
              `<td class="muted">${esc(j.reason ?? j.company ?? '')}</td><td>${actionBtns(j.id)}</td></tr>`,
          )
          .join(''),
      }),
    ]);
  };
  const cards = [
    section(t('queue.human'), human),
    section(t('queue.review'), review),
    section(
      t('queue.whatsapp'),
      (whatsapp ?? []).map((q) => ({
        id: q.jobId ?? '',
        url: '#',
        title: q.subject ?? q.recipient,
        reason: `${q.recipient ?? ''} ${q.attachmentPath ?? ''}`,
      })),
    ),
  ].filter(Boolean);
  if (!cards.length) {
    p.append(el('div', { class: 'card muted', text: t('queue.empty') }));
    return;
  }
  const wrap = el('div', {}, cards);
  wrap.onclick = jobActions(rQueue, () => []);
  p.append(wrap);
}

// ── vault ──────────────────────────────────────────────────────────────────
async function rVault() {
  const p = panel('vault');
  p.innerHTML = `<h2>${t('vault.title')}</h2><p class="muted">${t('common.loading')}</p>`;
  const { refs } = await api('vault');
  const refIn = el('input', { attrs: { type: 'text', placeholder: 'smtp-main' } });
  const secretIn = el('textarea', { attrs: { rows: 5, placeholder: t('vault.secret') } });
  const save = el('button', { class: 'primary', text: t('vault.save') });
  save.onclick = async () => {
    const ref = refIn.value.trim();
    let secret = secretIn.value.trim();
    if (!ref || !secret) return;
    try {
      secret = JSON.stringify(JSON.parse(secret));
    } catch {
      toast(`${t('msg.err')} JSON inválido`);
      return;
    }
    await api(`vault/${encodeURIComponent(ref)}`, {
      method: 'PUT',
      body: JSON.stringify({ secret }),
    });
    toast(t('msg.saved'));
    rVault();
  };
  const list = el('table', {
    html: refs.length
      ? refs
          .map(
            (r) =>
              `<tr><td><code>${esc(r)}</code></td><td><button class="danger" data-ref="${esc(r)}">${t('act.del')}</button></td></tr>`,
          )
          .join('')
      : `<tr><td class="muted">${t('vault.empty')}</td></tr>`,
  });
  list.onclick = async (ev) => {
    const btn = ev.target.closest('button[data-ref]');
    if (!btn || !confirm(`${t('msg.confirm_remove')} ${btn.dataset.ref}?`)) return;
    await api(`vault/${encodeURIComponent(btn.dataset.ref)}`, { method: 'DELETE' });
    toast(t('msg.deleted'));
    rVault();
  };
  p.innerHTML = `<h2>${t('vault.title')}</h2>`;
  p.append(
    el('div', { class: 'card' }, [el('h2', { text: t('vault.refs') }), list]),
    el('div', { class: 'card' }, [
      el('h2', { text: t('vault.add') }),
      el('p', { class: 'muted', text: t('vault.ref') }),
      refIn,
      el('p', { class: 'muted', text: t('vault.secret') }),
      secretIn,
      el('div', { class: 'row', attrs: { style: 'margin-top:8px' } }, [save]),
    ]),
  );
}

// ── profile ────────────────────────────────────────────────────────────────
async function rProfile() {
  const p = panel('profile');
  p.innerHTML = `<h2>${t('profile.title')}</h2><p class="muted">${t('common.loading')}</p>`;
  const prof = await api('profile');
  p.innerHTML = `<h2>${t('profile.title')}</h2>`;
  const md = el('textarea', { attrs: { rows: 18 } });
  md.value = prof.master ?? '';
  const save = el('button', { class: 'primary', text: t('profile.save') });
  save.onclick = async () => {
    const r = await api('profile', { method: 'PUT', body: JSON.stringify({ markdown: md.value }) });
    toast(r.warnings?.length ? `${t('msg.saved')} (⚠ ${r.warnings.length})` : t('msg.saved'));
  };
  const file = el('input', { attrs: { type: 'file', accept: 'application/pdf' } });
  const imp = el('button', { text: t('profile.import') });
  imp.onclick = async () => {
    const f = file.files[0];
    if (!f) return;
    const b64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(f);
    });
    await api('profile/import', {
      method: 'POST',
      body: JSON.stringify({ name: f.name, dataB64: b64 }),
    });
    toast(`${t('msg.saved')} → ${f.name}`);
  };
  const runImport = el('button', { text: t('profile.run_import') });
  runImport.onclick = () => runTask(['import', '--inbox']);
  const approve = el('button', { text: t('profile.approve') });
  approve.onclick = () => runTask(['approve']);
  p.append(
    el('div', { class: 'card' }, [
      el('div', { class: 'row' }, [file, imp, runImport, approve]),
      el('p', { class: 'muted', text: prof.master ? prof.masterPath : t('profile.no_master') }),
      md,
      el('div', { class: 'row', attrs: { style: 'margin-top:8px' } }, [save]),
    ]),
    prof.draft
      ? el('div', { class: 'card' }, [
          el('h2', { text: t('profile.draft') }),
          el('pre', { class: 'console', text: prof.draft }),
        ])
      : '',
  );
}

// ── runtime ────────────────────────────────────────────────────────────────
async function rRuntime() {
  const p = panel('runtime');
  p.innerHTML = `<h2>${t('runtime.title')}</h2><p class="muted">${t('common.loading')}</p>`;
  const rt = await api('runtime');
  const row = (k, ok) =>
    `<tr><td>${k}</td><td><span class="pill ${ok ? 'ok' : 'err'}">${ok ? 'ok' : '—'}</span></td></tr>`;
  const setup = el('button', { class: 'primary', text: t('runtime.setup') });
  setup.onclick = () => runTask(['runtime', 'setup']);
  p.innerHTML = `<h2>${t('runtime.title')}</h2>`;
  p.append(
    el('div', { class: 'card' }, [
      el('dl', { class: 'kv' }, [
        el('dt', { text: t('runtime.dir') }),
        el('dd', { text: rt.runtimeDir ?? '(nenhum)' }),
        el('dt', { text: t('runtime.candidates') }),
        el('dd', { text: (rt.candidates ?? []).join(' | ') }),
      ]),
      el('table', {
        html:
          row(t('runtime.node_modules'), rt.nodeModules) +
          row(t('runtime.browsers'), rt.browsers) +
          row(t('runtime.tessdata'), rt.tessdata) +
          row(t('runtime.skills'), rt.skills) +
          row(t('runtime.playwright'), rt.playwright),
      }),
      el('div', { class: 'row', attrs: { style: 'margin-top:10px' } }, [setup]),
    ]),
  );
}

// ── terminal ───────────────────────────────────────────────────────────────
const CMD_PRESETS = [
  'discover',
  'discover --dry-run',
  'discover --export jobs.json',
  'run --dry-run',
  'run',
  'scan remoteok',
  'review',
  'retry --send',
  'status',
  'applied',
  'import --inbox',
  'approve',
  'config check',
  'vault list',
  'whatsapp status',
  'login',
  'runtime status',
];
async function rTerminal() {
  const p = panel('terminal');
  if (p.dataset.built) return;
  p.dataset.built = '1';
  const sel = el(
    'select',
    {},
    CMD_PRESETS.map((c) => el('option', { text: c })),
  );
  const argsIn = el('input', { attrs: { type: 'text', placeholder: t('term.args'), size: 20 } });
  const run = el('button', { class: 'primary', text: t('term.run') });
  const input = el('input', { attrs: { type: 'text', placeholder: t('term.input') } });
  const send = el('button', { text: t('term.send') });
  const kill = el('button', { class: 'danger', text: t('term.kill') });
  const out = el('pre', { class: 'console' });
  let taskId = null;
  const term = async (argv) => {
    if (es) es.close();
    const { task } = await api('tasks', { method: 'POST', body: JSON.stringify({ argv }) });
    taskId = task.id;
    out.textContent = `$ ${task.argv.join(' ')}\n`;
    es = new EventSource(`/api/tasks/${task.id}/events?token=${token}`);
    es.onmessage = (ev) => {
      const d = JSON.parse(ev.data);
      if (d.chunk) {
        out.textContent += d.chunk;
        out.scrollTop = out.scrollHeight;
      }
      if (d.done) es.close();
    };
    es.onerror = () => es.close();
    toast(`${t('msg.task_started')} ${task.id.slice(0, 8)}`);
    renderTasks();
  };
  run.onclick = () => {
    const argv = [...sel.value.split(' '), ...argsIn.value.trim().split(' ')]
      .map((s) => s.trim())
      .filter(Boolean);
    term(argv);
  };
  send.onclick = () => {
    if (taskId && input.value)
      api(`tasks/${taskId}/input`, {
        method: 'POST',
        body: JSON.stringify({ data: input.value + '\n' }),
      });
    input.value = '';
  };
  kill.onclick = () => taskId && api(`tasks/${taskId}/kill`, { method: 'POST' });
  const tasksBox = el('div');
  async function renderTasks() {
    const { tasks } = await api('tasks');
    tasksBox.innerHTML = `<table>${tasks
      .slice(0, 10)
      .map(
        (tk) =>
          `<tr><td class="muted">${tk.id.slice(0, 8)}</td><td>${esc(tk.argv.join(' '))}</td>` +
          `<td><span class="pill ${tk.status === 'done' ? 'ok' : tk.status === 'running' ? 'acc' : 'err'}">${tk.status}</span></td>` +
          `<td><button data-view="${tk.id}">${t('act.edit')}</button></td></tr>`,
      )
      .join('')}</table>`;
    tasksBox.onclick = (ev) => {
      const b = ev.target.closest('button[data-view]');
      if (b) {
        if (es) es.close();
        taskId = b.dataset.view;
        out.textContent = '';
        es = new EventSource(`/api/tasks/${taskId}/events?token=${token}`);
        es.onmessage = (ev) => {
          const d = JSON.parse(ev.data);
          if (d.chunk) {
            out.textContent += d.chunk;
            out.scrollTop = out.scrollHeight;
          }
          if (d.done) es.close();
        };
      }
    };
  }
  p.innerHTML = `<h2>${t('term.title')}</h2>`;
  p.append(
    el('div', { class: 'card row' }, [sel, argsIn, run]),
    el('div', { class: 'card' }, [out, el('div', { class: 'row' }, [input, send, kill])]),
    el('div', { class: 'card' }, [el('h2', { text: t('term.task') }), tasksBox]),
  );
  renderTasks();
}
function runTask(argv) {
  current = 'terminal';
  show('terminal');
  setTimeout(() => {
    api('tasks', { method: 'POST', body: JSON.stringify({ argv }) }).then((r) => {
      toast(`${t('msg.task_started')} ${r.task.id.slice(0, 8)}`);
      rTerminal();
    });
  }, 50);
}

// ── boot ───────────────────────────────────────────────────────────────────
const RENDER = {
  dashboard: rDash,
  config: rConfig,
  jobs: rJobs,
  queue: rQueue,
  vault: rVault,
  profile: rProfile,
  runtime: rRuntime,
  terminal: rTerminal,
};
document.getElementById('lang').value = localStorage.getItem('ui-lang') ?? 'pt';
document.getElementById('lang').onchange = (e) => setLang(e.target.value);
setLang(localStorage.getItem('ui-lang') ?? 'pt').catch((e) =>
  toast(`${t('msg.err')} ${e.message}`),
);
