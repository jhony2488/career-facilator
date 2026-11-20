#!/usr/bin/env node
/**
 * CLI do CareerFacilator AI — entrypoint.
 *
 *   career-facilitator                              # Shell interativo (prompt career>)
 *   career-facilitator import --pdf <caminho>       # Ingestão de perfil via LLM local (doc 13)
 *   career-facilitator import --inbox [--watch]     # Varre/monitora storage/profile_inbox/
 *   career-facilitator run --jobs-file <json> [--dry-run]
 *   career-facilitator review                       # Fila NEEDS_HUMAN_INPUT / READY_TO_REVIEW
 *   career-facilitator status                       # Resumo do SQLite
 *   career-facilitator config                       # Roteamento de modelos resolvido do .env
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import {
  importResume,
  processInbox,
  approveProfileDraft,
  type InboxItemResult,
} from '../intake/intakeCore';
import { createNodePdfReader } from '../intake/pdfReaderNode';
import { listPendingPdfs, moveToProcessed } from '../intake/inboxScanner';
import { MasterProfileStore } from '../intake/masterProfileStore';
import { loadCareerOpsConfig, loadEffectiveEnv, parseEnvFile } from '../config/loadConfig';
import { careerHome, resolveHome, packageRoot } from '../config/paths';
import { setEnvKey, unsetEnvKey } from '../config/envFile';
import { createNodeFileStore } from '../intake/nodeFileStore';
import {
  createModelClients,
  createEmbedder,
  ProviderNotImplementedError,
  type ModelCallStats,
} from '../ai/modelFactory';
import { createOllamaClient } from '../ai/ollamaClient';
import { JobRepository } from '../db/repository';
import { runApplicationPipeline } from '../core/pipeline';
import { retrieveHybrid } from '../ai/rag/profileRetriever';
import { loadSkillRegistry } from '../skills/core/skillRegistry';
import type { MasterProfileLike } from '../core/types';
import type { PageStateLike } from '../autofill/formExecutor';

const argv = process.argv.slice(2);
const config = loadCareerOpsConfig();
const effEnv = loadEffectiveEnv();
const HOME = careerHome(effEnv.env);
const DB_PATH = effEnv.env.JOBS_DB_PATH ?? resolveHome('storage/jobs.sqlite', effEnv.env);

const USAGE =
  'Comandos: import --pdf <caminho> | import --inbox [--watch] [--replace] | ' +
  'run --jobs-file <json> [--dry-run] [--verbose] | review | approve | status | ' +
  'config [path|init|get|set|unset] | exit';

/** Template mínimo gravado por `config init` — sem chaves reais. */
const ENV_TEMPLATE = `# CareerFacilator AI — configuração global (gerada por 'config init')
# Referência completa: .env.example no repositório.
EXECUTION_MODE=HYBRID_THRESHOLD
AI_LOCAL_PROVIDER=ollama
AI_LOCAL_MODEL=qwen2.5:7b
AI_FAST_PROVIDER=ollama
AI_FAST_MODEL=qwen2.5:7b
AI_SMART_PROVIDER=ollama
AI_SMART_MODEL=qwen2.5:7b
OLLAMA_BASE_URL=http://localhost:11434
# AI_SMART_PROVIDER=anthropic
# ANTHROPIC_API_KEY=
`;

/** Erro de uso/entrada — impresso sem stack; no shell não derruba o REPL. */
class CliError extends Error {}

/** Rejeição de AbortSignal — Ctrl+C ou timeout. */
const isAbortError = (err: unknown): boolean =>
  err instanceof Error && err.name === 'AbortError';

const abortError = (): Error => Object.assign(new Error('Aborted'), { name: 'AbortError' });

/** Stream de tokens no terminal apenas quando --verbose. */
const streamTokens = (args: string[]) =>
  args.includes('--verbose') ? (t: string) => process.stdout.write(t) : undefined;

/** Progresso silencioso: '.' a cada ~32 chars de token — mostra que o modelo está gerando. */
const dotsTokens = (() => {
  let pending = 0;
  return (t: string) => {
    pending += t.length;
    while (pending >= 32) {
      process.stdout.write('.');
      pending -= 32;
    }
  };
})();

/** Callback de tokens: --verbose mostra o stream; sem ele, pontinhos de progresso. */
const tokenSink = (args: string[]) => streamTokens(args) ?? dotsTokens;

/** Linha de métricas ao fim de cada chamada de modelo (provider-agnóstico). */
const onStage = (s: ModelCallStats): void => {
  const secs = s.durationMs ? `${(s.durationMs / 1000).toFixed(1)}s` : '?';
  const toks = s.outputTokens !== undefined ? ` · ${s.outputTokens} tok` : '';
  const tps = s.tokensPerSecond ? ` · ${s.tokensPerSecond} tok/s` : '';
  const load = s.loadDurationMs ? ` · carga ${(s.loadDurationMs / 1000).toFixed(1)}s` : '';
  console.log(`\n  ✓ ${s.stage} (${s.provider}/${s.modelId}) ${secs}${toks}${tps}${load}`);
};

async function requireOllama(baseUrl: string | undefined, modelId: string): Promise<void> {
  const probe = createOllamaClient({ baseUrl });
  if (!(await probe.isReachable())) {
    throw new CliError(
      `Ollama offline em ${baseUrl ?? 'http://localhost:11434'}. ` +
        `Rode 'ollama serve' e 'ollama pull ${modelId}'.`,
    );
  }
  const installed = await probe.listModels();
  const wanted = modelId.includes(':') ? modelId : `${modelId}:latest`;
  if (installed.length && !installed.some((m) => m === wanted || m === modelId)) {
    throw new CliError(
      `Modelo '${wanted}' não baixado em ${baseUrl ?? 'localhost:11434'}. ` +
        `Rode 'ollama pull ${wanted}'. Instalados: ${installed.join(', ')}`,
    );
  }
}

function openRepo(): JobRepository {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  return new JobRepository(DB_PATH);
}

function loadMasterProfile(): MasterProfileLike {
  const compiled = config.profile.compiledPath;
  if (!existsSync(compiled)) {
    throw new CliError(
      `Perfil compilado não encontrado em ${compiled} — rode 'import --pdf' e aprove o rascunho.`,
    );
  }
  return JSON.parse(readFileSync(compiled, 'utf8')) as MasterProfileLike;
}

function printImportResult(result: InboxItemResult): void {
  if (result.outcome === 'UNREADABLE_DOCUMENT') {
    console.error(`  ${result.path}: ${result.alert}`);
    return;
  }
  console.log(`  ${result.path} → rascunho em ${result.draftPath}`);
  if (result.conflicts?.length) {
    console.log(`    Conflitos a decidir: ${result.conflicts.map((c) => c.field).join(', ')}`);
  }
}

async function cmdImport(args: string[], signal?: AbortSignal): Promise<void> {
  const useInbox = args.includes('--inbox');
  const watch = args.includes('--watch');
  const pdfIdx = args.indexOf('--pdf');
  const pdfPath = pdfIdx === -1 ? (useInbox || watch ? undefined : args[0]) : args[pdfIdx + 1];
  if (!useInbox && !watch && !pdfPath) {
    throw new CliError('Uso: import --pdf <caminho> | import --inbox [--watch]');
  }
  const mode = args.includes('--replace') ? 'REPLACE' : 'MERGE';

  const { smart } = config.ai;
  if (smart.provider === 'ollama') await requireOllama(smart.baseUrl, smart.modelId);

  let clients;
  try {
    clients = createModelClients(config, { onToken: tokenSink(args), onStage, signal });
  } catch (err) {
    throw new CliError(err instanceof Error ? err.message : String(err));
  }

  const cfg = config.profile;
  const store = new MasterProfileStore(
    { draftPath: cfg.draftPath, masterPath: cfg.masterPath, historyDir: cfg.historyDir },
    { fs: createNodeFileStore() },
  );

  if (useInbox || watch) {
    const deps = {
      reader: createNodePdfReader(),
      model: clients.structurerModel,
      store,
      scanner: { listPendingPdfs, moveToProcessed },
      onFile: (p: string) => {
        if (signal?.aborted) throw abortError();
        console.log(
          `Estruturando ${basename(p)} via ${smart.provider}/${smart.modelId} ` +
            `(1ª chamada carrega o modelo — pode demorar)…`,
        );
      },
    };
    const sweep = async () => {
      const inbox = await processInbox({ inboxDir: cfg.inboxDir, mode }, deps);
      if (!inbox.scanned) {
        console.log('Inbox vazia — nenhum PDF pendente.');
        return;
      }
      for (const item of inbox.results) printImportResult(item);
      if (inbox.results.some((r) => r.outcome === 'DRAFT_PENDING_REVIEW')) {
        console.log(`\nRascunho atualizado em ${cfg.draftPath} — revise antes de aprovar.`);
      }
    };
    await sweep();

    if (watch) {
      const { watch: fsWatch } = await import('node:fs');
      mkdirSync(cfg.inboxDir, { recursive: true });
      console.log(`\nMonitorando ${cfg.inboxDir} — solte PDFs lá.`);
      let debounce: NodeJS.Timeout | undefined;
      const watcher = fsWatch(cfg.inboxDir, (_event, filename) => {
        if (!filename?.toLowerCase().endsWith('.pdf')) return;
        if (signal?.aborted) return;
        clearTimeout(debounce);
        debounce = setTimeout(
          () => void sweep().catch((e) => { if (!isAbortError(e)) console.error(e); }),
          500,
        );
      });
      signal?.addEventListener('abort', () => {
        clearTimeout(debounce);
        watcher.close();
        console.log('\nMonitoramento interrompido (Ctrl+C).');
      });
      return; // watch fica ativo em background (no shell, o prompt continua livre)
    }
    return;
  }

  console.log(
    `Estruturando ${resolve(pdfPath as string)} via ${smart.provider}/${smart.modelId} ` +
      `(1ª chamada carrega o modelo — pode demorar)…`,
  );
  const result = await importResume(
    { file: { path: pdfPath as string }, mode, source: 'CLI' },
    { reader: createNodePdfReader(), model: clients.structurerModel, store },
  );
  if (result.outcome === 'UNREADABLE_DOCUMENT') {
    throw new CliError(result.alert ?? 'Documento ilegível.');
  }
  console.log(`\nRascunho gerado em ${result.draftPath} — revise antes de aprovar.`);
  if (result.conflicts?.length) {
    console.log(`Conflitos a decidir: ${result.conflicts.map((c) => c.field).join(', ')}`);
  }
}

async function cmdRun(args: string[], signal?: AbortSignal): Promise<void> {
  const fileIdx = args.indexOf('--jobs-file');
  const jobsPath =
    fileIdx === -1 ? args.find((a) => !a.startsWith('-')) : args[fileIdx + 1];
  const dryRun = args.includes('--dry-run');

  if (!jobsPath) {
    console.log('Uso: run --jobs-file <caminho.json> [--dry-run]  (ou: run <caminho.json>)');
    console.log('Formato do arquivo: [{"url": "https://…/vaga", "html": "<html da página>"}, …]');
    return;
  }

  const pendingInbox = await listPendingPdfs(config.profile.inboxDir);
  if (pendingInbox.length) {
    console.log(
      `⚠ ${pendingInbox.length} PDF(s) pendente(s) em ${config.profile.inboxDir} ` +
        `— rode 'import --inbox' para gerar o rascunho de perfil.`,
    );
  }

  const rawJobs = JSON.parse(readFileSync(resolve(jobsPath), 'utf8')) as {
    url: string;
    html: string;
  }[];
  const profile = loadMasterProfile();

  if (config.ai.local.provider === 'ollama') {
    await requireOllama(config.ai.local.baseUrl, config.ai.local.modelId);
  }

  const clients = createModelClients(config, { onToken: tokenSink(args), onStage, signal });
  const embedder = createEmbedder(config);
  const skills = await loadSkillRegistry(join(packageRoot, 'src/skills/library')).catch(() => []);
  const repo = openRepo();

  const emptyPage = (url: string): PageStateLike => ({
    url,
    fields: [],
    hasCaptcha: false,
    requiresEmailOtp: false,
    validationErrors: [],
    alreadyAppliedBanner: false,
    currentStep: 1,
    totalSteps: 1,
    isShadowDom: false,
    submitted: false,
  });

  let result;
  try {
    result = await runApplicationPipeline(
      { rawJobs, profile, config, dryRun },
      {
        repo,
        triageModel: clients.triageModel,
        tailorModel: clients.tailorModel,
        pageFactory: () => emptyPage(''),
        skills,
        retriever: (chunks, keywords, jobText) =>
          retrieveHybrid(chunks, { keywords, jobText }, embedder),
      },
    );
  } finally {
    repo.close();
  }

  console.log(`\n${result.processed} vaga(s) processada(s):`);
  for (const a of result.applications) {
    console.log(`  ${a.status.padEnd(20)} ${a.fitScore ?? '—'} ${a.url}${a.reason ? ` (${a.reason})` : ''}`);
  }
  console.log(
    `Chamadas de modelo: triagem=${result.tokenReport.triageCalls} smart=${result.tokenReport.smartTierCalls}`,
  );
}

/** Aprova o rascunho pendente: promove a perfil-mestre e invalida derivados (doc 13). */
async function cmdApprove(): Promise<void> {
  const cfg = config.profile;
  if (!existsSync(cfg.draftPath)) {
    throw new CliError(`Nenhum rascunho pendente em ${cfg.draftPath}.`);
  }
  const store = new MasterProfileStore(
    { draftPath: cfg.draftPath, masterPath: cfg.masterPath, historyDir: cfg.historyDir },
    { fs: createNodeFileStore() },
  );
  const result = await approveProfileDraft({ store });
  console.log(`Rascunho aprovado → ${cfg.masterPath}`);
  console.log(`Snapshot da versão anterior em ${cfg.historyDir}`);
  if (result.cacheInvalidated) console.log('Cache de prompt invalidado.');
  if (result.scoresToRecalculate) {
    console.log('Fit Scores pendentes serão recalculados na próxima execução.');
  }
}

async function cmdReview(): Promise<void> {
  const repo = openRepo();
  const pending = [
    ...(await repo.listByStatus('NEEDS_HUMAN_INPUT')),
    ...(await repo.listByStatus('READY_TO_REVIEW')),
  ];
  repo.close();
  if (!pending.length) {
    console.log('Fila vazia — nenhuma candidatura pendente de ação humana.');
    return;
  }
  console.log(`${pending.length} candidatura(s) aguardando você:`);
  for (const j of pending) {
    console.log(`  [${j.status}] ${j.title} — ${j.company}\n    ${j.url}`);
  }
}

async function cmdStatus(): Promise<void> {
  const repo = openRepo();
  const counts = await repo.countByStatus();
  repo.close();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`${total} vaga(s) no banco (${DB_PATH}):`);
  for (const [status, n] of Object.entries(counts).sort()) {
    console.log(`  ${status.padEnd(20)} ${n}`);
  }
}

function cmdConfig(args: string[]): void {
  const [sub, key, ...rest] = args;
  const envFile = effEnv.homeEnvFile;

  switch (sub) {
    case 'path': {
      console.log(`Diretório de dados (CAREER_HOME): ${HOME}`);
      console.log(`Arquivo de configuração:          ${envFile}`);
      return;
    }
    case 'init': {
      mkdirSync(HOME, { recursive: true });
      for (const p of [config.profile.inboxDir, config.profile.historyDir]) {
        mkdirSync(p, { recursive: true });
      }
      mkdirSync(dirname(DB_PATH), { recursive: true });
      if (!existsSync(envFile) || args.includes('--force')) {
        writeFileSync(envFile, ENV_TEMPLATE, 'utf8');
        console.log(`Criado ${envFile}`);
      } else {
        console.log(`${envFile} já existe — use 'config init --force' para sobrescrever.`);
      }
      console.log(`Diretório de dados pronto em ${HOME}`);
      console.log(`Próximo passo: solte o CV em ${config.profile.inboxDir} e rode 'import --inbox'.`);
      return;
    }
    case 'get': {
      if (!key) throw new CliError('Uso: config get <CHAVE>');
      const value = effEnv.env[key];
      if (value === undefined) {
        console.log(`${key} não definida`);
        return;
      }
      const localFile = resolve('.env');
      const local =
        resolve(localFile) !== resolve(envFile) ? parseEnvFile(localFile)[key] : undefined;
      const global = parseEnvFile(envFile)[key];
      const shadow =
        local !== undefined && local !== global
          ? `  (efetivo; global: ${global ?? '—'}, .env local: ${local})`
          : '';
      console.log(`${key}=${value}${shadow}`);
      return;
    }
    case 'set': {
      const value = rest.join(' ');
      if (!key || value === '') throw new CliError('Uso: config set <CHAVE> <valor>');
      setEnvKey(envFile, key, value);
      console.log(`${key}=${value}  →  ${envFile}`);
      return;
    }
    case 'unset': {
      if (!key) throw new CliError('Uso: config unset <CHAVE>');
      unsetEnvKey(envFile, key);
      console.log(`${key} removida de ${envFile}`);
      return;
    }
    case undefined:
      break;
    default:
      throw new CliError(`Subcomando desconhecido: config ${sub}. Use path|init|get|set|unset.`);
  }

  const { ai } = config;
  console.log('Roteamento de modelos (resolvido do .env):');
  for (const tier of ['local', 'fast', 'smart'] as const) {
    const r = ai[tier];
    console.log(
      `  ${tier.toUpperCase().padEnd(6)} ${r.provider}/${r.modelId}` +
        (r.baseUrl ? ` @ ${r.baseUrl}` : '') +
        (r.apiKeyEnv ? ` (key: $${r.apiKeyEnv})` : ''),
    );
  }
  if (ai.embeddings) {
    console.log(`  EMBED  ollama/${ai.embeddings.modelId} (RAG semântico ativo)`);
  }
  console.log(`  Modo de execução: ${config.execution.mode}`);
  console.log('Caminhos:');
  console.log(`  HOME      ${HOME}  (CAREER_HOME p/ mudar)`);
  console.log(`  ENV       ${effEnv.homeEnvFile}`);
  console.log(`  DB        ${DB_PATH}`);
  console.log(`  INBOX     ${config.profile.inboxDir}`);
  console.log(`  MASTER    ${config.profile.masterPath}`);
  console.log(`  DRAFT     ${config.profile.draftPath}`);
}

/** Despacha um comando. Retorna false se o comando não existe. */
async function dispatch(command: string, args: string[], signal?: AbortSignal): Promise<boolean> {
  switch (command) {
    case 'import':
      await cmdImport(args, signal);
      return true;
    case 'run':
      await cmdRun(args, signal);
      return true;
    case 'review':
      await cmdReview();
      return true;
    case 'approve':
      await cmdApprove();
      return true;
    case 'status':
      await cmdStatus();
      return true;
    case 'config':
      cmdConfig(args);
      return true;
    default:
      return false;
  }
}

function printError(err: unknown): void {
  if (isAbortError(err)) {
    console.log('\nComando cancelado (Ctrl+C).');
    return;
  }
  if (err instanceof CliError || err instanceof ProviderNotImplementedError) {
    console.error(err.message);
  } else {
    console.error(err);
  }
}

/** Shell interativo: `npm run cli` sem argumentos abre o prompt `career>`. */
async function repl(): Promise<void> {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'career> ' });
  let closed = false;
  let current: AbortController | null = null;
  rl.on('close', () => { closed = true; });
  // Ctrl+C: com comando em curso → aborta (fetch, watch, pipeline); ocioso → sai do shell.
  rl.on('SIGINT', () => {
    if (current && !current.signal.aborted) {
      current.abort();
    } else {
      rl.close();
    }
  });
  console.log(
    `CareerFacilator AI — shell interativo. 'help' lista comandos, 'exit' sai. Ctrl+C cancela.`,
  );
  rl.prompt();
  rl.on('line', (line) => {
    const [cmd, ...cmdArgs] = line.trim().split(/\s+/).filter(Boolean);
    void (async () => {
      if (!cmd) return;
      if (cmd === 'exit' || cmd === 'quit' || cmd === 'q') {
        rl.close();
        return;
      }
      if (cmd === 'help' || cmd === '?') {
        console.log(USAGE);
        return;
      }
      const ctrl = new AbortController();
      current = ctrl;
      try {
        if (!(await dispatch(cmd, cmdArgs, ctrl.signal))) {
          console.log(`Comando desconhecido: ${cmd}. ${USAGE}`);
        }
      } catch (err) {
        printError(err);
      } finally {
        if (current === ctrl) current = null;
      }
    })().finally(() => {
      if (!closed) rl.prompt();
    });
  });
  await new Promise<void>((resolvePromise) => rl.on('close', resolvePromise));
}

async function main(): Promise<void> {
  if (!argv.length) {
    await repl();
    return;
  }
  const ctrl = new AbortController();
  process.once('SIGINT', () => ctrl.abort());
  try {
    const [command, ...args] = argv;
    if (!(await dispatch(command, args, ctrl.signal))) {
      console.log(`CareerFacilator AI — ${USAGE}`);
      process.exitCode = 1;
    }
  } catch (err) {
    printError(err);
    process.exitCode = isAbortError(err)
      ? 130
      : err instanceof ProviderNotImplementedError
        ? 2
        : 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
