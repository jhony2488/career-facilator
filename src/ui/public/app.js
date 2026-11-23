/* CareerFacilator AI — UI local. Vanilla JS, sem build.
 * Token de sessão vem em ?token= na URL e vai no header X-UI-Token.
 * Dual-audiência: simples por padrão; detalhes técnicos em <details>/Avançado. */
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
  for (const c of children) if (c) e.append(c);
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

// ── labels amigáveis (mapas do i18n; fallback = nome técnico) ────────────────
const JOB_STATUSES = [
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
const jobLabel = (s) => dict[`job.${s}`] ?? s;
const taskLabel = (s) => dict[`task.${s}`] ?? s;
const srcLabel = (s) => dict[`src.${s}`] ?? s;
const statusPill = (s) => `<span class="pill" title="${s}">${jobLabel(s)}</span>`;
const taskPill = (s) =>
  `<span class="pill ${s === 'done' ? 'ok' : s === 'running' ? 'acc' : 'err'}" title="${s}">${taskLabel(s)}</span>`;

// Card de erro reutilizável (aba inteira falhou — mostra mensagem + retry).
function errorCard(id, err) {
  const p = panel(id);
  p.innerHTML = '';
  const retry = el('button', { class: 'primary', text: t('err.retry') });
  retry.onclick = () => show(id);
  p.append(
    el('div', { class: 'card err-card' }, [
      el('h2', { text: t('err.title') }),
      el('p', { text: err?.message ?? String(err) }),
      retry,
    ]),
  );
}

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
  const fn = RENDER[id];
  if (fn) fn().catch((e) => errorCard(id, e));
}
const sub = (key) => el('p', { class: 'muted', text: t(key) });

// ── dashboard ──────────────────────────────────────────────────────────────
async function rDash() {
  const p = panel('dashboard');
  p.innerHTML = `<h2>${t('tab.dashboard')}</h2><p class="muted">${t('common.loading')}</p>`;
  const [meta, status, taskList, prof, env] = await Promise.all([
    api('meta'),
    api('status'),
    api('tasks'),
    api('profile').catch(() => ({})),
    api('env').catch(() => ({ entries: [] })),
  ]);
  p.innerHTML = `<h2>${t('tab.dashboard')}</h2>`;

  // ── Primeiros passos (onboarding) ───────────────────────────────────────
  const steps = [
    { ok: !!prof.master, label: 'onb.profile', target: 'profile' },
    {
      ok: (env.entries ?? []).some((e) => /PROVIDER|OLLAMA_MODEL|_API_KEY/.test(e.key) && e.value),
      label: 'onb.ai',
      target: 'config',
    },
    { ok: Object.values(status.counts ?? {}).some((n) => n > 0), label: 'onb.jobs', target: null },
    { ok: false, label: 'onb.queue', target: 'queue' },
  ];
  steps[3].ok =
    steps[2].ok && !!(status.counts?.NEEDS_HUMAN_INPUT || status.counts?.READY_TO_REVIEW);
  const doneAll = steps.slice(0, 3).every((s) => s.ok);
  const nextIdx = steps.findIndex((s) => !s.ok);
  const onb = el('div', { class: `card onb ${doneAll ? 'ok' : ''}` }, [
    el('h2', { text: doneAll ? t('onb.done_title') : t('onb.title') }),
    ...steps.map((s, i) => {
      const row = el('div', { class: `onb-step ${s.ok ? 'done' : i === nextIdx ? 'next' : ''}` }, [
        el('span', {
          class: 'onb-mark',
          text: s.ok ? '✓' : `${i + 1}`,
        }),
        el('span', { class: 'onb-txt', text: t(s.label) }),
      ]);
      if (!s.ok && s.target && i === nextIdx) {
        const go = el('button', { class: 'primary', text: t('onb.go') });
        go.onclick = () => show(s.target);
        row.append(go);
      } else if (!s.ok && i === nextIdx && s.label === 'onb.jobs') {
        const go = el('button', { class: 'primary', text: t('onb.go') });
        go.onclick = () => {
          show('terminal');
          runTask(['discover']);
        };
        row.append(go);
      }
      return row;
    }),
  ]);

  const kv = el('dl', { class: 'kv' }, [
    el('dt', { text: t('dash.version') }),
    el('dd', { text: meta.version }),
    el('dt', { text: t('dash.home') }),
    el('dd', { text: meta.home }),
    el('dt', { text: t('dash.db') }),
    el('dd', { text: meta.dbPath }),
  ]);
  const countEntries = Object.entries(status.counts ?? {}).sort();
  const stats = el(
    'div',
    {},
    countEntries.map(([k, n]) =>
      el('span', { class: 'stat' }, [
        el('b', { text: String(n) }),
        el('span', { text: jobLabel(k) }),
      ]),
    ),
  );
  const rows = taskList.tasks
    .slice(0, 8)
    .map(
      (tk) =>
        `<tr><td class="muted">${tk.startedAt.slice(11, 19)}</td><td>${esc(tk.argv.join(' '))}</td><td>${taskPill(tk.status)}</td></tr>`,
    )
    .join('');
  const tech = el('details', {}, [
    el('summary', { text: t('adv.details') }),
    el('dl', { class: 'kv' }, [
      el('dt', { text: t('dash.platform') }),
      el('dd', { text: meta.platform }),
      el('dt', { text: meta.exeDir ? t('dash.exe') : t('dash.cwd') }),
      el('dd', { text: meta.exeDir ?? meta.cwd }),
      ...(meta.exePath
        ? [
            el('dt', { text: t('dash.cli') }),
            el('dd', {}, [
              el('code', { text: meta.exePath }),
              el('div', { class: 'muted', text: t('dash.cli_hint') }),
            ]),
          ]
        : []),
    ]),
  ]);
  p.append(
    onb,
    el('div', { class: 'card' }, [el('h2', { text: t('dash.meta') }), kv, tech]),
    el('div', { class: 'card' }, [
      el('h2', { text: t('dash.counts') }),
      countEntries.length ? stats : el('p', { class: 'muted', text: t('jobs.empty') }),
    ]),
    el('div', { class: 'card' }, [
      el('h2', { text: t('dash.tasks') }),
      el('table', { html: rows || `<tr><td class="muted">${t('common.none')}</td></tr>` }),
    ]),
  );
}

// ── config ─────────────────────────────────────────────────────────────────
const ESSENTIAL_SECTIONS = 5; // primeiras seções do .env.example ficam abertas
async function rConfig() {
  const p = panel('config');
  p.innerHTML = `<h2>${t('config.title')}</h2><p class="muted">${t('common.loading')}</p>`;
  const [data, example] = await Promise.all([api('env'), api('env/example').catch(() => null)]);
  const setMap = Object.fromEntries(data.entries.map((e) => [e.key, e]));
  const usedKeys = new Set(example?.sections.flatMap((s) => s.items.map((i) => i.key)) ?? []);
  const extras = data.entries.filter((e) => !usedKeys.has(e.key));

  const rowHtml = (key, e, def, comment) => {
    const val = e ? esc(e.value) : `<span class="muted">${t('common.none')}</span>`;
    const src = e
      ? `<span class="pill ${e.source === 'process' ? 'warn' : 'acc'}">${srcLabel(e.source)}</span>`
      : '';
    const defTxt = def ? ` <span class="muted">(default: ${esc(def)})</span>` : '';
    const commentTxt = comment
      ? `<div class="muted" style="font-size:11px;margin-top:2px">${esc(comment)}</div>`
      : '';
    return (
      `<tr data-search="${esc(`${key} ${comment ?? ''}`).toLowerCase()}">` +
      `<td class="env-key"><code>${esc(key)}</code>${commentTxt}</td>` +
      `<td class="env-val" title="${esc(e?.value ?? def ?? '')}">${val}${defTxt}</td>` +
      `<td>${src}</td>` +
      `<td class="env-act"><button data-edit="${esc(key)}">${t('act.edit')}</button>` +
      (e ? ` <button class="danger" data-del="${esc(key)}">${t('act.del')}</button>` : '') +
      `</td></tr>`
    );
  };
  const tableHtml = (rows) =>
    `<table class="env-table"><tr><th class="w-key">${t('config.key')}</th>` +
    `<th class="w-val">${t('config.value')}</th><th class="w-src">${t('config.source')}</th>` +
    `<th class="w-act"></th></tr>${rows}</table>`;

  p.innerHTML = `<h2>${t('config.title')}</h2>`;
  p.append(sub('config.sub'));

  // ── Importar .env ──────────────────────────────────────────────────────
  const file = el('input', { attrs: { type: 'file', accept: '.env,text/plain' } });
  const impBtn = el('button', { class: 'primary', text: t('config.import') });
  const paste = el('textarea', {
    attrs: {
      rows: 3,
      placeholder: t('config.import_paste'),
      style: 'width:100%;margin:6px 0',
    },
  });
  impBtn.onclick = async () => {
    let content = paste.value;
    if (file.files[0]) content = await file.files[0].text();
    if (!content.trim()) return toast(t('config.import_empty'));
    const r = await api('env/import', { method: 'POST', body: JSON.stringify({ content }) });
    toast(`${t('config.import_done')} ${r.applied}`);
    rConfig();
  };

  // ── Links p/ tutoriais ─────────────────────────────────────────────────
  const REPO = 'https://github.com/jhony2488/career-facilitator/blob/main';
  const langDir = (document.documentElement.lang ?? 'pt-BR') === 'pt-BR' ? 'pt-BR' : 'en';
  const tutFile = (ptName, enName) => (langDir === 'pt-BR' ? ptName : enName);
  const LINKS = [
    [tutFile('04-configurando-ollama.md', '04-setting-up-ollama.md'), t('config.link_ollama')],
    [
      tutFile('05-configurando-ias-remotas.md', '05-setting-up-remote-llms.md'),
      t('config.link_remote'),
    ],
    [
      tutFile('03-instalacao-binario-release.md', '03-release-binary-install.md'),
      t('config.link_exe'),
    ],
    [tutFile('09-interface-grafica.md', '09-graphical-interface.md'), t('config.link_ui')],
  ];
  const linksCard = el('div', { class: 'card' }, [
    el('h2', { text: t('config.links') }),
    ...LINKS.map(([path, label]) =>
      el('div', { class: 'env-link' }, [
        el('a', {
          text: label,
          attrs: {
            href: `${REPO}/tutorials/${langDir}/${path}`,
            target: '_blank',
            rel: 'noopener',
          },
        }),
      ]),
    ),
  ]);

  // ── Catálogo: essenciais abertos, resto em <details> + busca ────────────
  const cards = [];
  const sections = example?.sections ?? [];
  sections.forEach((sec, i) => {
    const rows = sec.items
      .map((it) => rowHtml(it.key, setMap[it.key], it.default, it.comment))
      .join('');
    const body = el('div', { class: 'env-scroll', html: tableHtml(rows) });
    if (i < ESSENTIAL_SECTIONS) {
      cards.push(el('div', { class: 'card env-section' }, [el('h2', { text: sec.title }), body]));
    } else {
      cards.push(
        el('div', { class: 'card env-section adv' }, [
          el('details', {}, [el('summary', { text: sec.title }), body]),
        ]),
      );
    }
  });
  if (extras.length) {
    cards.push(
      el('div', { class: 'card env-section adv' }, [
        el('details', {}, [
          el('summary', { text: t('config.extras') }),
          el('div', {
            class: 'env-scroll',
            html: tableHtml(extras.map((e) => rowHtml(e.key, e)).join('')),
          }),
        ]),
      ]),
    );
  }

  // Busca filtra linhas e abre <details> que contenham match.
  const search = el('input', {
    attrs: { type: 'text', placeholder: t('config.search'), style: 'width:100%;margin-bottom:8px' },
  });
  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    for (const card of cards) {
      let any = false;
      for (const tr of card.querySelectorAll('tr[data-search]')) {
        const hit = !q || tr.dataset.search.includes(q);
        tr.classList.toggle('hidden', !hit);
        any = any || hit;
      }
      const det = card.querySelector('details');
      if (det) det.open = !!q && any;
      card.classList.toggle('hidden', !!q && !any);
    }
  };

  const files = el('dl', { class: 'kv' }, [
    el('dt', { text: t('config.file_home') }),
    el('dd', { text: data.homeEnvFile }),
    el('dt', { text: t('config.file_cwd') }),
    el('dd', { text: data.cwdEnvFile }),
    ...(data.exeEnvFile
      ? [el('dt', { text: t('config.file_exe') }), el('dd', { text: data.exeEnvFile })]
      : []),
  ]);

  p.append(
    search,
    el('div', { class: 'card' }, [
      el('div', { class: 'row' }, [file, impBtn]),
      paste,
      el('p', { class: 'muted', text: t('config.hint') }),
      el('details', {}, [el('summary', { text: t('config.files_title') }), files]),
    ]),
    linksCard,
    ...cards,
  );

  // Delegação única p/ botões editar/remover de todas as tabelas.
  p.onclick = async (ev) => {
    const btn = ev.target.closest('button');
    if (!btn || (!btn.dataset.edit && !btn.dataset.del)) return;
    const key = btn.dataset.edit ?? btn.dataset.del;
    try {
      if (btn.dataset.edit) {
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
    } catch (e) {
      toast(`${t('msg.err')} ${e.message}`);
    }
  };
}

// ── jobs ───────────────────────────────────────────────────────────────────
async function rJobs() {
  const p = panel('jobs');
  p.innerHTML = `<h2>${t('jobs.title')}</h2>`;
  p.append(sub('jobs.sub'));
  const sel = el(
    'select',
    {},
    ['', ...JOB_STATUSES].map((s) =>
      el('option', { text: s ? jobLabel(s) : t('jobs.all'), attrs: { value: s } }),
    ),
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
      const go = el('button', { class: 'primary', text: t('jobs.empty_go') });
      go.onclick = () => {
        show('terminal');
        runTask(['discover']);
      };
      tbl.innerHTML = '';
      tbl.append(el('p', { class: 'muted', text: t('jobs.empty') }), go);
      return;
    }
    tbl.innerHTML = `<div class="env-scroll"><table><tr><th>${t('jobs.jobtitle')}</th><th>${t('jobs.company')}</th><th>${t('jobs.status')}</th><th>${t('jobs.score')}</th><th>${t('jobs.actions')}</th></tr>${jobs
      .map(
        (j) =>
          `<tr><td><a href="${esc(j.url)}" target="_blank" style="color:var(--accent)">${esc(j.title ?? j.url)}</a></td>` +
          `<td>${esc(j.company ?? '—')}</td><td>${statusPill(j.status)}</td>` +
          `<td>${j.fitScore ?? '—'}</td><td>${actionBtns(j.id)}</td></tr>`,
      )
      .join('')}</table></div>`;
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
  p.append(sub('queue.sub'));
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
  p.innerHTML = `<h2>${t('vault.title')}</h2>`;
  p.append(sub('vault.sub'));

  // Modo rápido (SMTP) × JSON avançado
  const modeQuick = el('button', { class: 'mode-btn active', text: t('vault.mode_quick') });
  const modeJson = el('button', { class: 'mode-btn', text: t('vault.mode_json') });
  const quickBox = el('div');
  const jsonBox = el('div', { class: 'hidden' });
  modeQuick.onclick = () => {
    modeQuick.classList.add('active');
    modeJson.classList.remove('active');
    quickBox.classList.remove('hidden');
    jsonBox.classList.add('hidden');
  };
  modeJson.onclick = () => {
    modeJson.classList.add('active');
    modeQuick.classList.remove('active');
    jsonBox.classList.remove('hidden');
    quickBox.classList.add('hidden');
  };

  // — rápida: campos SMTP → JSON interno
  const qRef = el('input', { attrs: { type: 'text', value: 'smtp-main' } });
  const qHost = el('input', { attrs: { type: 'text', placeholder: 'smtp.gmail.com' } });
  const qPort = el('input', { attrs: { type: 'number', value: 587, style: 'width:90px' } });
  const qUser = el('input', { attrs: { type: 'text', placeholder: 'meu@email.com' } });
  const qPass = el('input', { attrs: { type: 'password', placeholder: t('vault.q_pass') } });
  const qSecure = el('input', { attrs: { type: 'checkbox' } });
  const qSave = el('button', { class: 'primary', text: t('vault.save') });
  qSave.onclick = async () => {
    const secret = JSON.stringify({
      host: qHost.value.trim(),
      port: Number(qPort.value) || 587,
      secure: qSecure.checked,
      user: qUser.value.trim(),
      pass: qPass.value,
    });
    try {
      await api(`vault/${encodeURIComponent(qRef.value.trim() || 'smtp-main')}`, {
        method: 'PUT',
        body: JSON.stringify({ secret }),
      });
      toast(t('msg.saved'));
      rVault();
    } catch (e) {
      toast(`${t('msg.err')} ${e.message}`);
    }
  };
  quickBox.append(
    el('div', { class: 'row' }, [el('span', { class: 'muted', text: t('vault.q_ref') }), qRef]),
    el('div', { class: 'row' }, [
      el('span', { class: 'muted', text: 'SMTP' }),
      qHost,
      el('span', { class: 'muted', text: 'port' }),
      qPort,
      el('label', { class: 'muted' }, [
        qSecure,
        document.createTextNode(' ' + t('vault.q_secure')),
      ]),
    ]),
    el('div', { class: 'row' }, [qUser, qPass]),
    el('div', { class: 'row' }, [qSave]),
  );

  // — avançada: ref + JSON cru
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
      toast(`${t('msg.err')} ${t('vault.bad_json')}`);
      return;
    }
    await api(`vault/${encodeURIComponent(ref)}`, {
      method: 'PUT',
      body: JSON.stringify({ secret }),
    });
    toast(t('msg.saved'));
    rVault();
  };
  jsonBox.append(
    el('p', { class: 'muted', text: t('vault.ref') }),
    refIn,
    el('p', { class: 'muted', text: t('vault.secret') }),
    secretIn,
    el('div', { class: 'row', attrs: { style: 'margin-top:8px' } }, [save]),
  );

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
  p.append(
    el('div', { class: 'card' }, [el('h2', { text: t('vault.refs') }), list]),
    el('div', { class: 'card' }, [
      el('div', { class: 'row mode-row' }, [modeQuick, modeJson]),
      quickBox,
      jsonBox,
    ]),
  );
}

// ── profile ────────────────────────────────────────────────────────────────
async function rProfile() {
  const p = panel('profile');
  p.innerHTML = `<h2>${t('profile.title')}</h2><p class="muted">${t('common.loading')}</p>`;
  const prof = await api('profile');
  p.innerHTML = `<h2>${t('profile.title')}</h2>`;
  p.append(sub('profile.sub'));
  const md = el('textarea', { attrs: { rows: 18 } });
  md.value = prof.master ?? '';
  const save = el('button', { class: 'primary', text: t('profile.save') });
  save.onclick = async () => {
    const r = await api('profile', { method: 'PUT', body: JSON.stringify({ markdown: md.value }) });
    toast(r.warnings?.length ? `${t('msg.saved')} (⚠ ${r.warnings.length})` : t('msg.saved'));
  };
  const file = el('input', { attrs: { type: 'file', accept: 'application/pdf' } });
  const imp = el('button', { class: 'primary', text: t('profile.import') });
  imp.onclick = async () => {
    const f = file.files[0];
    if (!f) return toast(t('profile.pick_pdf'));
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
      el('p', { class: 'muted', text: t('profile.steps') }),
      el('div', { class: 'row' }, [file, imp, runImport, approve]),
      el('details', {}, [
        el('summary', { text: t('profile.advanced') }),
        el('p', { class: 'muted', text: prof.master ? prof.masterPath : t('profile.no_master') }),
        md,
        el('div', { class: 'row', attrs: { style: 'margin-top:8px' } }, [save]),
      ]),
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
  const missing = [
    ['runtime.node_modules', rt.nodeModules],
    ['runtime.browsers', rt.browsers],
    ['runtime.tessdata', rt.tessdata],
    ['runtime.skills', rt.skills],
    ['runtime.playwright', rt.playwright],
  ].filter(([, ok]) => !ok);
  const allOk = missing.length === 0;
  const row = (k, ok) =>
    `<tr><td>${k}</td><td><span class="pill ${ok ? 'ok' : 'err'}">${ok ? 'ok' : '—'}</span></td></tr>`;
  const setup = el('button', { class: 'primary', text: t('runtime.setup') });
  setup.onclick = () => runTask(['runtime', 'setup']);
  p.innerHTML = `<h2>${t('runtime.title')}</h2>`;
  p.append(sub('runtime.sub'));
  p.append(
    el('div', { class: `card verdict ${allOk ? 'ok' : 'warn'}` }, [
      el('h2', {
        text: allOk ? t('runtime.all_ok') : t('runtime.missing'),
      }),
      allOk
        ? el('p', { class: 'muted', text: t('runtime.all_ok_desc') })
        : el('div', {}, [
            el('p', { class: 'muted', text: t('runtime.missing_desc') }),
            el('div', { class: 'row' }, [setup]),
          ]),
    ]),
    el('div', { class: 'card' }, [
      el('details', {}, [
        el('summary', { text: t('adv.details') }),
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
      ]),
    ]),
  );
}

// ── executar (terminal) ────────────────────────────────────────────────────
// Ações comuns — label+descrição amigáveis; argv roda o binário como subprocesso.
const ACTIONS = [
  { id: 'discover', argv: ['discover'], warn: false },
  { id: 'discover_dry', argv: ['discover', '--dry-run'], warn: false },
  { id: 'run', argv: ['run'], warn: true },
  { id: 'run_dry', argv: ['run', '--dry-run'], warn: false },
  { id: 'review', argv: ['review'], warn: false },
  { id: 'retry', argv: ['retry', '--send'], warn: true },
  { id: 'status', argv: ['status'], warn: false },
  { id: 'import', argv: ['import', '--inbox'], warn: false },
  { id: 'approve', argv: ['approve'], warn: false },
  { id: 'config_check', argv: ['config', 'check'], warn: false },
];
const CMD_PRESETS = [
  'discover',
  'discover --export jobs.json',
  'scan remoteok',
  'retry',
  'applied',
  'vault list',
  'whatsapp status',
  'login',
  'runtime status',
  'config get EXECUTION_MODE',
];
let watchTask = null; // preenchido quando a aba Executar é construída
async function rTerminal() {
  const p = panel('terminal');
  if (p.dataset.built) return;
  p.dataset.built = '1';
  const input = el('input', { attrs: { type: 'text', placeholder: t('term.input') } });
  const send = el('button', { text: t('term.send') });
  const kill = el('button', { class: 'danger', text: t('term.kill') });
  const out = el('pre', { class: 'console' });
  let taskId = null;
  const watch = (id) => {
    if (es) es.close();
    taskId = id;
    es = new EventSource(`/api/tasks/${id}/events?token=${token}`);
    es.onmessage = (ev) => {
      const d = JSON.parse(ev.data);
      if (d.chunk) {
        out.textContent += d.chunk;
        out.scrollTop = out.scrollHeight;
      }
      if (d.done) es.close();
    };
    es.onerror = () => es.close();
  };
  const term = async (argv) => {
    const { task } = await api('tasks', { method: 'POST', body: JSON.stringify({ argv }) });
    out.textContent = `$ ${task.argv.join(' ')}\n`;
    watch(task.id);
    toast(`${t('msg.task_started')}`);
    renderTasks();
  };

  // ── Ações comuns ─────────────────────────────────────────────────────────
  const actionGrid = el(
    'div',
    { class: 'action-grid' },
    ACTIONS.map((a) => {
      const b = el('button', {
        class: `action-btn ${a.warn ? 'warn' : ''}`,
        attrs: { title: a.argv.join(' ') },
      });
      b.append(
        el('span', { class: 'action-label', text: t(`action.${a.id}`) }),
        el('span', { class: 'action-desc', text: t(`action.${a.id}.desc`) }),
      );
      b.onclick = async () => {
        if (a.warn && !confirm(t(`action.${a.id}.confirm`))) return;
        try {
          await term(a.argv);
        } catch (e) {
          toast(`${t('msg.err')} ${e.message}`);
        }
      };
      return b;
    }),
  );

  // ── Avançado ────────────────────────────────────────────────────────────
  const sel = el(
    'select',
    {},
    CMD_PRESETS.map((c) => el('option', { text: c })),
  );
  const argsIn = el('input', { attrs: { type: 'text', placeholder: t('term.args'), size: 20 } });
  const run = el('button', { class: 'primary', text: t('term.run') });
  run.onclick = () => {
    const argv = [...sel.value.split(' '), ...argsIn.value.trim().split(' ')]
      .map((s) => s.trim())
      .filter(Boolean);
    if (argv.length) term(argv);
  };
  const adv = el('details', {}, [
    el('summary', { text: t('term.advanced') }),
    el('div', { class: 'row' }, [sel, argsIn, run]),
  ]);

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
    tasksBox.innerHTML = tasks.length
      ? `<table>${tasks
          .slice(0, 10)
          .map(
            (tk) =>
              `<tr><td>${esc(tk.argv.join(' '))}</td>` +
              `<td>${taskPill(tk.status)}</td>` +
              `<td><button data-view="${tk.id}">${t('term.view')}</button></td></tr>`,
          )
          .join('')}</table>`
      : `<p class="muted">${t('common.none')}</p>`;
    tasksBox.onclick = (ev) => {
      const b = ev.target.closest('button[data-view]');
      if (b) {
        out.textContent = '';
        watch(b.dataset.view);
      }
    };
  }
  watchTask = watch;
  p.innerHTML = `<h2>${t('term.title')}</h2>`;
  p.append(
    sub('term.sub'),
    el('div', { class: 'card' }, [actionGrid, adv]),
    el('div', { class: 'card' }, [
      out,
      el('div', { class: 'row' }, [input, send, kill]),
      el('p', { class: 'muted', text: t('term.input_hint') }),
    ]),
    el('div', { class: 'card' }, [el('h2', { text: t('term.task') }), tasksBox]),
  );
  renderTasks();
}
function runTask(argv) {
  current = 'terminal';
  show('terminal');
  setTimeout(() => {
    api('tasks', { method: 'POST', body: JSON.stringify({ argv }) })
      .then((r) => {
        toast(`${t('msg.task_started')}`);
        if (watchTask) watchTask(r.task.id);
      })
      .catch((e) => toast(`${t('msg.err')} ${e.message}`));
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
