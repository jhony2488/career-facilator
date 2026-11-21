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
import { checkProviders, type ProviderCheckResult, type TierKey } from '../ai/preflight';
import { createOllamaClient } from '../ai/ollamaClient';
import type { ModelRouting } from '../config/careerOps.config';
import { JobRepository } from '../db/repository';
import { runApplicationPipeline, type PipelineResult } from '../core/pipeline';
import { createSemanticTitleMatcher } from '../core/titleMatcher';
import { discoverJobs, toRawJobInputs } from '../discovery/discoveryEngine';
import { createGenericExtractor } from '../discovery/genericExtractor';
import { getActiveSources, listSources } from '../discovery/sourceRegistry';
import { FileCredentialVault } from '../email_application/credentialVault';
import { createSmtpTransport, smtpCredentialFromEnv } from '../email_application/smtpTransport';
import type { CredentialVault } from '../email_application/emailDispatcher';
import {
  createEvolutionClient,
  createEvolutionSetup,
} from '../whatsapp_application/evolutionClient';
import { retrieveHybrid } from '../ai/rag/profileRetriever';
import { getJobBrowserContext, closeJobBrowser } from '../scraper/browserManager';
import { followApplyLink, inspectPage } from '../scraper/pageInspector';
import { loadSkillRegistry } from '../skills/core/skillRegistry';
import type { MasterProfileLike } from '../core/types';
import type { PageStateLike } from '../autofill/formExecutor';

// No exe (SEA) suprime warnings experimentais do Node (ex: node:sqlite) —
// stderr limpo p/ usuário do binário. Em dev (tsx) os warnings continuam.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- detecção síncrona de SEA (import() é assíncrono demais para este ponto de entrada)
  const sea = require('node:sea') as { isSea?: () => boolean };
  if (sea.isSea?.()) process.removeAllListeners('warning');
} catch {
  /* node:sea indisponível — execução normal */
}

const argv = process.argv.slice(2);
const config = loadCareerOpsConfig();
const effEnv = loadEffectiveEnv();
const HOME = careerHome(effEnv.env);
const DB_PATH = effEnv.env.JOBS_DB_PATH ?? resolveHome('storage/jobs.sqlite', effEnv.env);

const HELP = [
  'Comandos:',
  '',
  '  Perfil',
  '    import --pdf <arquivo>                  Estrutura um CV em PDF → profile.draft.md',
  '    import --inbox [--watch] [--replace]    Processa PDFs pendentes da inbox',
  '    approve                                 Promove o rascunho a perfil-mestre',
  '',
  '  Descoberta de vagas',
  '    discover [--sources id1,id2] [--max-jobs N] [--export <json>]',
  '                                          Lista/exporta vagas descobertas (--dry-run lista fontes)',
  '    scan <source-id> [--max-jobs N]         Testa uma fonte e imprime amostras',
  '    run [--jobs-file <json>] [--sources id1,id2] [--max-jobs N] [--dry-run] [--verbose]',
  '                                          Descobre vagas (ou lê jobs.json) e roda o funil',
  '',
  '  Revisão e estado',
  '    review                                  NEEDS_HUMAN_INPUT + READY_TO_REVIEW + fila WhatsApp',
  '    status                                  Contagens por status no jobs.sqlite',
  '    applied [--limit N]                     Candidaturas enviadas (total por canal, hoje, recentes)',
  '',
  '  Configuração e canais',
  '    config [path|init|get|set|unset|check]  Config global + preflight dos tiers de IA',
  '    vault [list|set|remove <ref>]           Cofre de credenciais (SMTP etc.)',
  '    whatsapp [setup|status]                 Evolution API: instância + QR no terminal',
  '',
  '  Outros',
  '    version                                 Versão da build',
  '    help                                    Esta ajuda',
  '    exit                                    Sai do shell interativo',
].join('\n');

/** Contexto de execução de um comando — cancelamento + perguntas interativas. */
interface CmdCtx {
  signal?: AbortSignal;
  /** Só no REPL: pergunta sim/não ao usuário. */
  ask?: (question: string) => Promise<string>;
}

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
const isAbortError = (err: unknown): boolean => err instanceof Error && err.name === 'AbortError';

const abortError = (): Error => Object.assign(new Error('Aborted'), { name: 'AbortError' });

/**
 * Recursos que seguram o processo vivo (fs.watch etc.) — precisam de dispose
 * explícito pra Ctrl+C/exit realmente encerrar tudo.
 */
const cleanups = new Set<() => void>();
const registerCleanup = (cb: () => void): void => {
  cleanups.add(cb);
};
const runCleanups = (): void => {
  for (const cb of cleanups) {
    try {
      cb();
    } catch {
      /* best-effort */
    }
  }
  cleanups.clear();
};

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

/** Raciocínio do modelo em cinza (dim) — --thinking ou AI_THINK_ENABLED=true. */
const thoughtSink = (args: string[]) =>
  args.includes('--thinking') || effEnv.env.AI_THINK_ENABLED === 'true'
    ? (t: string) => process.stdout.write(`\x1b[2m${t}\x1b[0m`)
    : undefined;

/** Linha de métricas ao fim de cada chamada de modelo (provider-agnóstico). */
const onStage = (s: ModelCallStats): void => {
  const secs = s.durationMs ? `${(s.durationMs / 1000).toFixed(1)}s` : '?';
  const toks = s.outputTokens !== undefined ? ` · ${s.outputTokens} tok` : '';
  const tps = s.tokensPerSecond ? ` · ${s.tokensPerSecond} tok/s` : '';
  const load = s.loadDurationMs ? ` · carga ${(s.loadDurationMs / 1000).toFixed(1)}s` : '';
  console.log(`\n  ✓ ${s.stage} (${s.provider}/${s.modelId}) ${secs}${toks}${tps}${load}`);
};

const fmtRouting = (r: ModelRouting): string =>
  `${r.provider}/${r.modelId}${r.baseUrl ? ` @ ${r.baseUrl.replace(/^https?:\/\//, '')}` : ''}`;

/** Linha de status de um resultado de preflight. */
function printCheck(r: ProviderCheckResult): void {
  const ms = r.latencyMs ? ` (${r.latencyMs}ms)` : '';
  const adapter = r.adapterImplemented ? '' : ' — geração: adapter ainda não implementado';
  if (r.status === 'ok') {
    console.log(`  ${r.tier.toUpperCase().padEnd(6)} ${fmtRouting(r.routing)} — OK${ms}${adapter}`);
  } else if (r.status === 'skipped') {
    console.log(
      `  ${r.tier.toUpperCase().padEnd(6)} ${fmtRouting(r.routing)} — pulado (${r.detail ?? ''})`,
    );
  } else {
    console.log(
      `  ${r.tier.toUpperCase().padEnd(6)} ${fmtRouting(r.routing)} — FALHOU — ${r.detail ?? r.status}`,
    );
  }
}

/**
 * Preflight dos tiers usados pelo comando: testa endpoint+modelo e resolve
 * fallback. No REPL pergunta antes de trocar; fora dele falha com dica.
 * Retorna overrides de routing p/ createModelClients.
 */
async function requireAiReady(
  tiers: TierKey[],
  ctx: CmdCtx,
): Promise<Partial<Record<TierKey, ModelRouting>>> {
  console.log('Verificando provedores de IA…');
  const results = await checkProviders(config, tiers, {
    env: effEnv.env,
    signal: ctx.signal,
  });
  const overrides: Partial<Record<TierKey, ModelRouting>> = {};

  for (const r of results) {
    if (r.status === 'ok' || r.status === 'skipped') {
      printCheck(r);
      continue;
    }

    const fallback = r.routing.fallback;
    if (!fallback || fallback === 'off') {
      printCheck(r);
      throw new CliError(
        `${r.tier.toUpperCase()} (${fmtRouting(r.routing)}) falhou: ${r.detail ?? r.status}. ` +
          `Ajuste AI_${r.tier.toUpperCase()}_PROVIDER/MODEL ou configure AI_${r.tier.toUpperCase()}_FALLBACK.`,
      );
    }

    // Confere o fallback antes de oferecer — não adianta sugerir um quebrado.
    const fbCheck = await checkProviders(
      { ...config, ai: { ...config.ai, [r.tier]: fallback } },
      [r.tier],
      { env: effEnv.env, signal: ctx.signal },
    );
    printCheck(r);
    if (fbCheck[0].status !== 'ok') {
      throw new CliError(
        `${r.tier.toUpperCase()} falhou (${r.detail}) e o fallback ${fmtRouting(fallback)} ` +
          `também (${fbCheck[0].detail ?? fbCheck[0].status}). Corrija o .env.`,
      );
    }

    const question = `  ⚠ Usar fallback ${fmtRouting(fallback)}? [s/N] `;
    if (!ctx.ask || !(await ctx.ask(question)).trim().toLowerCase().startsWith('s')) {
      throw new CliError(
        `${r.tier.toUpperCase()} (${fmtRouting(r.routing)}) falhou: ${r.detail ?? r.status}. ` +
          `Fallback disponível: ${fmtRouting(fallback)} — rode no shell interativo p/ escolher, ` +
          `ou ajuste AI_${r.tier.toUpperCase()}_PROVIDER/MODEL no .env.`,
      );
    }
    overrides[r.tier] = fallback;
    console.log(`  ${r.tier.toUpperCase().padEnd(6)} → usando ${fmtRouting(fallback)}`);
  }

  // Modelo ollama já quente? Se não, aquece agora (visível) em vez de a 1ª
  // chamada real travar em silêncio.
  for (const tier of tiers) {
    const routing = overrides[tier] ?? config.ai[tier];
    if (routing.provider === 'ollama') {
      await warmOllamaIfNeeded(routing, ctx.signal);
    }
  }
  return overrides;
}

/** Verifica /api/ps; se o modelo não estiver na RAM, dispara 1 token p/ carregá-lo. */
async function warmOllamaIfNeeded(routing: ModelRouting, signal?: AbortSignal): Promise<void> {
  const client = createOllamaClient({
    baseUrl: routing.baseUrl,
    keepAlive: effEnv.env.OLLAMA_KEEP_ALIVE,
  });
  const loaded = await client.listLoadedModels();
  const wanted = routing.modelId.includes(':') ? routing.modelId : `${routing.modelId}:latest`;
  if (loaded.some((m) => m === wanted || m === routing.modelId)) {
    console.log(`  ${routing.modelId} já quente (carregado em RAM)`);
    return;
  }
  process.stdout.write(`  Aquecendo ${routing.modelId}…`);
  try {
    await client.chat(routing.modelId, [{ role: 'user', content: 'ok' }], {
      options: { num_predict: 1 },
      timeoutMs: 120_000,
      signal,
    });
    console.log(' pronto');
  } catch (err) {
    // warmup é best-effort — se falhar, a chamada real carrega o modelo do mesmo jeito
    if (isAbortError(err)) throw err;
    console.log(` falhou (será carregado na 1ª chamada)`);
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

async function cmdImport(args: string[], ctx: CmdCtx): Promise<void> {
  const useInbox = args.includes('--inbox');
  const watch = args.includes('--watch');
  const pdfIdx = args.indexOf('--pdf');
  const pdfPath = pdfIdx === -1 ? (useInbox || watch ? undefined : args[0]) : args[pdfIdx + 1];
  if (!useInbox && !watch && !pdfPath) {
    throw new CliError('Uso: import --pdf <caminho> | import --inbox [--watch]');
  }
  const mode = args.includes('--replace') ? 'REPLACE' : 'MERGE';
  const { signal } = ctx;

  const overrides = await requireAiReady(['smart'], ctx);
  const smart = overrides.smart ?? config.ai.smart;

  let clients;
  try {
    clients = createModelClients(
      config,
      { onToken: tokenSink(args), onThought: thoughtSink(args), onStage, signal, overrides },
      effEnv.env,
    );
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
      // auditoria: o texto extraído que a IA de fato viu (anti-hallucination aid)
      onExtracted: (text: string, sourcePath?: string) => {
        if (!sourcePath) return;
        const dir = join(dirname(cfg.inboxDir), 'profile_extracts');
        const out = join(dir, `${basename(sourcePath).replace(/\.pdf$/i, '')}.txt`);
        mkdirSync(dir, { recursive: true });
        writeFileSync(out, text, 'utf-8');
        console.log(`  texto extraído → ${out}`);
      },
      onFile: (p: string) => {
        if (signal?.aborted) throw abortError();
        console.log(`Estruturando ${basename(p)} via ${smart.provider}/${smart.modelId}…`);
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
          () =>
            void sweep().catch((e) => {
              if (!isAbortError(e)) console.error(e);
            }),
          500,
        );
      });
      const dispose = () => {
        clearTimeout(debounce);
        watcher.close();
      };
      signal?.addEventListener('abort', () => {
        dispose();
        cleanups.delete(dispose);
        console.log('\nMonitoramento interrompido (Ctrl+C).');
      });
      registerCleanup(dispose);
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

async function cmdRun(args: string[], ctx: CmdCtx): Promise<void> {
  const { signal } = ctx;
  const fileIdx = args.indexOf('--jobs-file');
  const positional = args.filter((a, i) => {
    if (a.startsWith('-')) return false;
    const prev = args[i - 1];
    return prev !== '--jobs-file' && prev !== '--sources' && prev !== '--max-jobs';
  });
  const jobsPath = fileIdx === -1 ? positional[0] : args[fileIdx + 1];
  const dryRun = args.includes('--dry-run');

  const maxJobsIdx = args.indexOf('--max-jobs');
  const parsedMaxJobs = maxJobsIdx === -1 ? NaN : Number(args[maxJobsIdx + 1]);
  const maxJobs = Number.isFinite(parsedMaxJobs) ? parsedMaxJobs : undefined;
  const sourcesIdx = args.indexOf('--sources');
  const sourceIds =
    sourcesIdx === -1
      ? undefined
      : args[sourcesIdx + 1]
          ?.split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean);

  const pendingInbox = await listPendingPdfs(config.profile.inboxDir);
  if (pendingInbox.length) {
    console.log(
      `⚠ ${pendingInbox.length} PDF(s) pendente(s) em ${config.profile.inboxDir} ` +
        `— rode 'import --inbox' para gerar o rascunho de perfil.`,
    );
  }

  const profile = loadMasterProfile();
  let rawJobs: { url: string; html: string }[];
  if (jobsPath) {
    rawJobs = JSON.parse(readFileSync(resolve(jobsPath), 'utf8')) as {
      url: string;
      html: string;
    }[];
  } else {
    console.log('Nenhum --jobs-file informado — iniciando descoberta de vagas…');
    const discovery = await discoverJobs({
      config,
      signal,
      maxJobs,
      sourceIds,
      extract: buildDiscoveryExtractor(signal),
    });
    if (discovery.errors.length) {
      for (const e of discovery.errors) {
        console.log(`  [${e.sourceId}] ${e.message}`);
      }
    }
    console.log(
      `Fontes: ${discovery.meta.sourcesSucceeded}/${discovery.meta.sourcesTried} | ` +
        `vagas descobertas: ${discovery.jobs.length}`,
    );
    if (discovery.jobs.length === 0) {
      console.log('Nenhuma vaga descoberta. Verifique DISCOVERY_SOURCES ou --sources.');
      return;
    }
    rawJobs = toRawJobInputs(discovery.jobs);
  }

  const overrides = await requireAiReady(['local', 'smart'], ctx);

  const clients = createModelClients(
    config,
    { onToken: tokenSink(args), onThought: thoughtSink(args), onStage, signal, overrides },
    effEnv.env,
  );
  const embedder = createEmbedder(config);
  // Título da vaga vs JOB_TITLES: determinístico primeiro; embeddings
  // (nomic-embed-text) como fallback quando não casa por léxico.
  const titleMatcher = createSemanticTitleMatcher(config.discovery.targetTitles, embedder);
  // No exe (SEA) o packageRoot é virtual — fallback p/ pasta "skills" ao lado
  // do executável; usuário pode copiá-la para manter a biblioteca de skills.
  const exeSkillsDir = join(dirname(process.execPath), 'skills');
  const skillsDir = existsSync(join(packageRoot, 'src/skills/library'))
    ? join(packageRoot, 'src/skills/library')
    : exeSkillsDir;
  const skills = await loadSkillRegistry(skillsDir).catch(() => []);
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

  // Formulário web real (feature/06): Chromium lazy — só abre na 1ª vaga com
  // form. Falha de navegação → emptyPage → cai no canal de mensagem como antes.
  // AUTOFILL_HEADLESS=false mostra o navegador; AUTOFILL_PROFILE_DIR reaproveita
  // logins do usuário via contexto persistente. No exe SEA o playwright é
  // externo e o import falha — mesma degradação, com aviso uma vez por run.
  let browserUnavailableWarned = false;
  const pageFactory = async (url: string): Promise<PageStateLike> => {
    try {
      const ctx = await getJobBrowserContext({
        headless: effEnv.env.AUTOFILL_HEADLESS !== 'false',
        profileDir: effEnv.env.AUTOFILL_PROFILE_DIR?.trim() || undefined,
      });
      const page = await ctx.newPage();
      try {
        const state = await inspectPage(page, url);
        // Página de empresa sem form: o "Apply" costuma levar ao ATS real —
        // 1 hop antes de declarar NO_CHANNEL.
        if (state.fields.length === 0) {
          const followed = await followApplyLink(page);
          if (followed) return followed;
        }
        return state;
      } catch {
        await page.close().catch(() => {});
        return emptyPage(url);
      }
    } catch {
      if (!browserUnavailableWarned) {
        browserUnavailableWarned = true;
        console.log(
          '⚠ Autofill web indisponível (playwright não inicializou) — ' +
            'vagas com formulário seguem p/ e-mail, WhatsApp ou revisão.',
        );
      }
      return emptyPage(url);
    }
  };

  // Canais de mensagem: e-mail (SMTP real) e WhatsApp (Evolution API) — docs 11/15.
  // Sem credencial/endpoint configurado o pipeline deixa a vaga em NEEDS_HUMAN_INPUT.
  const channelDeps: Parameters<typeof runApplicationPipeline>[1] = {
    repo,
    triageModel: clients.triageModel,
    tailorModel: clients.tailorModel,
    pageFactory,
    skills,
    retriever: (chunks, keywords, jobText) =>
      retrieveHybrid(chunks, { keywords, jobText }, embedder),
    titleMatcher,
  };

  if (config.email.enabled) {
    const fileVault = new FileCredentialVault(resolveHome('vault', effEnv.env));
    if (await fileVault.has(config.email.smtpCredentialRef)) {
      channelDeps.vault = fileVault;
      channelDeps.emailTransport = createSmtpTransport({
        vault: fileVault,
        ref: config.email.smtpCredentialRef,
      });
    } else {
      // Fallback env SMTP_* (uso local) — cofre continua preferido quando existe.
      const envSmtp = smtpCredentialFromEnv(effEnv.env);
      if (envSmtp) {
        const envVault: CredentialVault = {
          getCredential: async () => JSON.stringify(envSmtp),
        };
        channelDeps.vault = envVault;
        channelDeps.emailTransport = createSmtpTransport({ vault: envVault, ref: 'env:smtp' });
        console.log(
          `E-mail: credencial via env SMTP_* (${envSmtp.user}) — ` +
            `para guardar cifrada, 'vault set ${config.email.smtpCredentialRef}'.`,
        );
      } else {
        console.log(
          `E-mail: credencial '${config.email.smtpCredentialRef}' ausente no cofre ` +
            `— rode 'vault set ${config.email.smtpCredentialRef}'. Vagas de e-mail vão para revisão.`,
        );
      }
    }
  }

  if (config.whatsapp.enabled && config.whatsapp.mode === 'EVOLUTION_API') {
    const apiUrl = effEnv.env[config.whatsapp.apiUrlEnv];
    const apiKey = effEnv.env[config.whatsapp.apiKeyEnv];
    if (apiUrl && apiKey) {
      channelDeps.evolutionTransport = createEvolutionClient({
        apiUrl,
        apiKey,
        instance: config.whatsapp.apiInstance,
      });
    } else {
      console.log(
        `WhatsApp EVOLUTION_API sem ${config.whatsapp.apiUrlEnv}/${config.whatsapp.apiKeyEnv} ` +
          `definidos — vagas de WhatsApp cairão na fila manual.`,
      );
    }
  }

  const sentStatuses = new Set(['APPLIED', 'APPLIED_VIA_EMAIL', 'APPLIED_VIA_WHATSAPP']);
  const countSent = (r: PipelineResult) =>
    r.applications.filter((a) => sentStatuses.has(a.status)).length;

  let result;
  try {
    result = await runApplicationPipeline({ rawJobs, profile, config, dryRun }, channelDeps);

    // Meta de candidaturas por run (DISCOVERY_MIN_JOBS_PER_RUN): enviou menos
    // que a meta → o discovery expande, dobrando o teto por fonte a cada
    // rodada e excluindo URLs já coletadas, até bater a meta, esgotar as
    // fontes ou o teto global. --jobs-file e --dry-run não disparam expansão.
    const minRun = config.execution.minJobsPerRun;
    if (!dryRun && !jobsPath && minRun > 0) {
      let sent = countSent(result);
      let perSource = config.discovery.maxJobsPerSource;
      for (let round = 1; sent < minRun && round <= 3; round++) {
        const remaining = (maxJobs ?? config.execution.maxJobsPerRun) - rawJobs.length;
        if (remaining <= 0) break;
        perSource *= 2;
        const more = await discoverJobs({
          config,
          signal,
          maxJobs: remaining,
          sourceIds,
          perSourceMax: perSource,
          excludeUrls: rawJobs.map((j) => j.url),
          extract: buildDiscoveryExtractor(signal),
        });
        if (more.jobs.length === 0) break;
        console.log(
          `Meta ${sent}/${minRun} — expandindo discovery (rodada ${round}, ` +
            `até ${perSource}/fonte): +${more.jobs.length} vaga(s) nova(s)`,
        );
        const extraRaw = toRawJobInputs(more.jobs);
        rawJobs.push(...extraRaw);
        const extra = await runApplicationPipeline(
          { rawJobs: extraRaw, profile, config, dryRun },
          channelDeps,
        );
        result.processed += extra.processed;
        result.applications.push(...extra.applications);
        result.tokenReport.triageCalls += extra.tokenReport.triageCalls;
        result.tokenReport.smartTierCalls += extra.tokenReport.smartTierCalls;
        sent += countSent(extra);
      }
    }
  } finally {
    await closeJobBrowser();
    repo.close();
  }

  console.log(`\n${result.processed} vaga(s) processada(s):`);
  for (const a of result.applications) {
    console.log(
      `  ${a.status.padEnd(20)} ${a.fitScore ?? '—'} ${a.url}${a.reason ? ` (${a.reason})` : ''}`,
    );
  }
  console.log(
    `Chamadas de modelo: triagem=${result.tokenReport.triageCalls} smart=${result.tokenReport.smartTierCalls}`,
  );
  if (!dryRun && config.execution.minJobsPerRun > 0) {
    const sent = countSent(result);
    console.log(
      sent >= config.execution.minJobsPerRun
        ? `Meta mínima atingida: ${sent}/${config.execution.minJobsPerRun} candidatura(s) enviada(s).`
        : `⚠ Meta mínima não atingida: ${sent}/${config.execution.minJobsPerRun} candidatura(s) ` +
            `enviada(s) — fontes esgotadas ou vagas sem canal de candidatura.`,
    );
  }
}

/**
 * Fallback genérico por LLM: cria o extrator só quando habilitado
 * (DISCOVERY_USE_GENERIC_FALLBACK) e loga qual modelo foi resolvido —
 * DISCOVERY_GENERIC_MODEL explícito ou herança do tier LOCAL (AI_LOCAL_*).
 */
function buildDiscoveryExtractor(signal?: AbortSignal) {
  if (!config.discovery.useGenericHtmlFallback) return undefined;
  const res = createGenericExtractor(config, { env: effEnv.env, signal });
  if (!res) return undefined;
  if ('error' in res) {
    console.log(`⚠ Fallback genérico desativado — ${res.error}`);
    return undefined;
  }
  const inherited = !config.discovery.genericExtractionModel?.trim();
  console.log(
    `Fallback genérico (HTML+LLM): ollama/${res.modelId}` +
      (inherited ? ' — herdado de AI_LOCAL_*' : ' — DISCOVERY_GENERIC_MODEL'),
  );
  return res.extract;
}

async function cmdDiscover(args: string[], ctx: CmdCtx): Promise<void> {
  const sourcesIdx = args.indexOf('--sources');
  const sourceIds =
    sourcesIdx === -1
      ? undefined
      : args[sourcesIdx + 1]
          ?.split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean);
  const maxJobsIdx = args.indexOf('--max-jobs');
  const parsedMaxJobs = maxJobsIdx === -1 ? 10 : Number(args[maxJobsIdx + 1]);
  const maxJobs = Number.isFinite(parsedMaxJobs) ? parsedMaxJobs : 10;
  const exportIdx = args.indexOf('--export');
  const exportPath = exportIdx === -1 ? undefined : args[exportIdx + 1];
  const dryRun = args.includes('--dry-run');

  if (dryRun) {
    const active = getActiveSources(config, {
      sourceIds,
      includeRisky: Boolean(sourceIds?.length),
      includeAuth: Boolean(sourceIds?.length),
    });
    console.log(`Fontes ativas (${active.length}):`);
    for (const s of active) {
      console.log(`  ${s.id.padEnd(24)} ${s.name} (${s.adapter})`);
    }
    return;
  }

  console.log('Descobrindo vagas…');
  const discovery = await discoverJobs({
    config,
    signal: ctx.signal,
    maxJobs,
    sourceIds,
    extract: buildDiscoveryExtractor(ctx.signal),
  });
  for (const e of discovery.errors) {
    console.log(`  [${e.sourceId}] ${e.message}`);
  }
  console.log(
    `Fontes: ${discovery.meta.sourcesSucceeded}/${discovery.meta.sourcesTried} | ` +
      `brutas: ${discovery.meta.totalRaw} | únicas: ${discovery.meta.afterDedup} | ` +
      `retornadas: ${discovery.jobs.length} | tempo: ${discovery.meta.durationMs}ms`,
  );
  for (const j of discovery.jobs) {
    console.log(`  ${j.sourceId.padEnd(20)} ${j.raw.url}`);
  }
  if (exportPath) {
    writeFileSync(
      resolve(exportPath),
      JSON.stringify(toRawJobInputs(discovery.jobs), null, 2),
      'utf8',
    );
    console.log(`Exportado → ${exportPath}`);
  }
}

async function cmdScan(args: string[], ctx: CmdCtx): Promise<void> {
  const positional = args.filter((a, i) => {
    if (a.startsWith('-')) return false;
    const prev = args[i - 1];
    return prev !== '--sources' && prev !== '--max-jobs';
  });
  const sourceId = positional[0];
  if (!sourceId) {
    console.log('Uso: scan <source-id> [--max-jobs N]');
    return;
  }
  const maxJobsIdx = args.indexOf('--max-jobs');
  const parsedMaxJobs = maxJobsIdx === -1 ? 10 : Number(args[maxJobsIdx + 1]);
  const maxJobs = Number.isFinite(parsedMaxJobs) ? parsedMaxJobs : 10;

  console.log(`Escaneando ${sourceId}…`);
  const discovery = await discoverJobs({
    config,
    signal: ctx.signal,
    maxJobs,
    sourceIds: [sourceId],
    extract: buildDiscoveryExtractor(ctx.signal),
  });
  for (const e of discovery.errors) {
    console.log(`  [${e.sourceId}] ${e.message}`);
  }
  console.log(`Vagas encontradas: ${discovery.jobs.length} (${discovery.meta.durationMs}ms)`);
  for (const j of discovery.jobs) {
    const snippet = j.raw.html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 120);
    console.log(`  ${j.raw.url}`);
    console.log(`    ${snippet}…`);
  }
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
  const whatsappQueue = await repo.listWhatsappQueue();
  repo.close();
  if (!pending.length && !whatsappQueue.length) {
    console.log('Fila vazia — nenhuma candidatura pendente de ação humana.');
    return;
  }
  if (pending.length) {
    console.log(`${pending.length} candidatura(s) aguardando você:`);
    for (const j of pending) {
      console.log(`  [${j.status}] ${j.title} — ${j.company}\n    ${j.url}`);
    }
  }
  if (whatsappQueue.length) {
    console.log(`\n${whatsappQueue.length} candidatura(s) por WhatsApp para enviar na mão:`);
    for (const q of whatsappQueue) {
      console.log(`  [${q.jobId}] wa.me/${q.recipient}`);
      if (q.subject)
        console.log(
          `    Mensagem:\n${q.subject
            .split('\n')
            .map((l) => `      ${l}`)
            .join('\n')}`,
        );
      if (q.attachmentPath) console.log(`    Anexar: ${q.attachmentPath}`);
    }
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

/** `applied [--limit N]` — candidaturas efetivamente enviadas + recentes. */
async function cmdApplied(args: string[]): Promise<void> {
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx === -1 ? 10 : Number(args[limitIdx + 1]) || 10;

  const repo = openRepo();
  const counts = await repo.countByStatus();
  const sentToday = await repo.countEmailsSentToday();
  const applied = await repo.listApplied(limit);
  repo.close();

  const APPLIED = ['APPLIED', 'APPLIED_VIA_EMAIL', 'APPLIED_VIA_WHATSAPP'];
  const total = APPLIED.reduce((acc, s) => acc + (counts[s] ?? 0), 0);
  console.log(`${total} candidatura(s) enviada(s):`);
  for (const s of APPLIED) {
    if (counts[s]) console.log(`  ${s.padEnd(22)} ${counts[s]}`);
  }
  console.log(`  Hoje (e-mail)        ${sentToday}/${config.email.maxDailyEmails}`);

  if (applied.length) {
    console.log('\nRecentes:');
    for (const j of applied) {
      const when = j.appliedAt ? j.appliedAt.slice(0, 16).replace('T', ' ') : '—';
      console.log(`  ${when}  ${j.status.padEnd(20)} ${j.title} — ${j.company}`);
    }
  }
}

async function cmdConfig(args: string[], ctx: CmdCtx = {}): Promise<void> {
  const [sub, key, ...rest] = args;
  const envFile = effEnv.homeEnvFile;

  if (sub === 'check') {
    console.log('Verificando provedores de IA…');
    const results = await checkProviders(config, ['local', 'fast', 'smart'], {
      env: effEnv.env,
      signal: ctx.signal,
    });
    for (const r of results) printCheck(r);
    const failed = results.filter((r) => r.status !== 'ok' && r.status !== 'skipped');
    if (failed.length) {
      throw new CliError(
        `${failed.length} tier(s) indisponível(is) — ajuste o .env ou configure fallbacks.`,
      );
    }
    return;
  }

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
      console.log(
        `Próximo passo: solte o CV em ${config.profile.inboxDir} e rode 'import --inbox'.`,
      );
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
      throw new CliError(
        `Subcomando desconhecido: config ${sub}. Use path|init|get|set|unset|check.`,
      );
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
  console.log('Descoberta:');
  console.log(`  Fontes registradas: ${listSources(config).length}`);
  console.log(`  Ativas (após filtros): ${getActiveSources(config).length}`);
  console.log(`  JOB_TITLES: ${config.discovery.targetTitles.join(', ') || '—'}`);
  console.log('Canais de candidatura:');
  console.log(
    `  EMAIL    ${config.email.enabled ? config.email.dispatchMode : 'desligado'}` +
      ` — teto ${config.email.maxDailyEmails}/dia, cred '${config.email.smtpCredentialRef}',` +
      ` template ${config.email.bodyTemplatePath}`,
  );
  console.log(
    `  WHATSAPP ${config.whatsapp.enabled ? config.whatsapp.mode : 'desligado'}` +
      (config.whatsapp.mode === 'EVOLUTION_API'
        ? ` — instância ${config.whatsapp.apiInstance} @ $${config.whatsapp.apiUrlEnv}`
        : ''),
  );
  console.log('Caminhos:');
  console.log(`  HOME      ${HOME}  (CAREER_HOME p/ mudar)`);
  console.log(`  ENV       ${effEnv.homeEnvFile}`);
  console.log(`  DB        ${DB_PATH}`);
  console.log(`  INBOX     ${config.profile.inboxDir}`);
  console.log(`  MASTER    ${config.profile.masterPath}`);
  console.log(`  DRAFT     ${config.profile.draftPath}`);
}

/** Cofre de credenciais (doc 11/15): set/list/remove — segredos cifrados, nunca exibidos. */
async function cmdVault(args: string[], ctx: CmdCtx): Promise<void> {
  const [sub, ref] = args;
  const vault = new FileCredentialVault(resolveHome('vault', effEnv.env));

  switch (sub) {
    case 'list': {
      const refs = await vault.list();
      console.log(
        refs.length
          ? `Refs no cofre:\n${refs.map((r) => `  ${r}`).join('\n')}`
          : 'Cofre vazio — nenhuma credencial gravada.',
      );
      return;
    }
    case 'set': {
      if (!ref) throw new CliError('Uso: vault set <ref>  (ex.: vault set smtp-main)');
      if (!ctx.ask) {
        throw new CliError(
          `vault set é interativo — rode no shell ('npm run cli' sem argumentos) e digite 'vault set ${ref}'.`,
        );
      }
      const host = (await ctx.ask('SMTP host (ex.: smtp.gmail.com / smtp.office365.com): ')).trim();
      const portStr = (await ctx.ask('SMTP port (465 = TLS direto, 587 = STARTTLS): ')).trim();
      const secureStr = (await ctx.ask('TLS direto na conexão (porta 465)? [s/N]: ')).trim();
      const user = (await ctx.ask('Usuário (seu e-mail completo): ')).trim();
      const pass = (await ctx.ask('Senha de app (app password — não a senha da conta): ')).trim();
      const secure = secureStr.toLowerCase().startsWith('s');
      const cred = {
        host,
        port: Number(portStr) || (secure ? 465 : 587),
        secure,
        user,
        pass,
      };
      await vault.setCredential(ref, JSON.stringify(cred));
      console.log(
        `Credencial '${ref}' gravada criptografada em ${resolveHome('vault', effEnv.env)}.`,
      );
      return;
    }
    case 'remove': {
      if (!ref) throw new CliError('Uso: vault remove <ref>');
      const ok = await vault.remove(ref);
      console.log(ok ? `'${ref}' removida do cofre.` : `'${ref}' não encontrada no cofre.`);
      return;
    }
    default:
      throw new CliError('Uso: vault list | vault set <ref> | vault remove <ref>');
  }
}

/** Setup e estado da instância Evolution API (doc 15 §15.3) — QR no terminal. */
async function cmdWhatsapp(args: string[], ctx: CmdCtx): Promise<void> {
  const [sub, name] = args;
  const apiUrl = effEnv.env[config.whatsapp.apiUrlEnv];
  const apiKey = effEnv.env[config.whatsapp.apiKeyEnv];
  if (!apiUrl || !apiKey) {
    throw new CliError(
      `Evolution API não configurada — defina ${config.whatsapp.apiUrlEnv} e ` +
        `${config.whatsapp.apiKeyEnv} ('config set').`,
    );
  }
  const setup = createEvolutionSetup({ apiUrl, apiKey });

  switch (sub) {
    case 'setup': {
      const instanceName = name ?? config.whatsapp.apiInstance;
      console.log(`Criando instância '${instanceName}' em ${apiUrl}…`);
      await setup.createInstance(instanceName);

      const qr = await setup.getConnectionQr(instanceName);
      if (qr.code) {
        console.log('\nEscaneie o QR abaixo com o WhatsApp (Aparelhos conectados):');
        const qrcode = (await import('qrcode-terminal')).default;
        qrcode.generate(qr.code, { small: true });
      } else if (qr.pairingCode) {
        console.log(`Código de pareamento: ${qr.pairingCode}`);
      } else {
        console.log('Instância criada — verifique o QR no painel da Evolution API.');
      }

      console.log('Aguardando conexão (Ctrl+C para cancelar)…');
      const deadline = Date.now() + 150_000;
      while (Date.now() < deadline) {
        if (ctx.signal?.aborted) throw abortError();
        await new Promise((r) => setTimeout(r, 4000));
        const state = await setup.getConnectionState(instanceName);
        if (state === 'open') {
          setEnvKey(effEnv.homeEnvFile, 'EVOLUTION_INSTANCE', instanceName);
          console.log(
            `\n✓ Conectado! Instância '${instanceName}' salva em EVOLUTION_INSTANCE.\n` +
              `  Ative o envio automático com: config set WHATSAPP_MODE EVOLUTION_API`,
          );
          return;
        }
      }
      console.log('Tempo esgotado aguardando a conexão — tente whatsapp setup de novo.');
      return;
    }
    case 'status': {
      const state = await setup.getConnectionState(config.whatsapp.apiInstance);
      console.log(`Instância '${config.whatsapp.apiInstance}' (${config.whatsapp.mode}): ${state}`);
      return;
    }
    default:
      throw new CliError('Uso: whatsapp setup [nome] | whatsapp status');
  }
}

/** Despacha um comando. Retorna false se o comando não existe. */
async function dispatch(command: string, args: string[], ctx: CmdCtx = {}): Promise<boolean> {
  switch (command) {
    case 'import':
      await cmdImport(args, ctx);
      return true;
    case 'run':
      await cmdRun(args, ctx);
      return true;
    case 'discover':
      await cmdDiscover(args, ctx);
      return true;
    case 'scan':
      await cmdScan(args, ctx);
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
    case 'applied':
      await cmdApplied(args);
      return true;
    case 'config':
      await cmdConfig(args, ctx);
      return true;
    case 'vault':
      await cmdVault(args, ctx);
      return true;
    case 'whatsapp':
      await cmdWhatsapp(args, ctx);
      return true;
    case 'version':
      console.log(careerVersion());
      return true;
    case 'help':
    case '-h':
    case '--help':
    case '?':
      console.log(HELP);
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
  rl.on('close', () => {
    closed = true;
    runCleanups();
  });
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
        console.log(HELP);
        return;
      }
      const ctrl = new AbortController();
      current = ctrl;
      const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));
      try {
        if (!(await dispatch(cmd, cmdArgs, { signal: ctrl.signal, ask }))) {
          console.log(`Comando desconhecido: ${cmd} — 'help' lista os comandos.`);
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

/** Versão exibida: tag embutida no build do exe → package.json → 'dev'. */
function careerVersion(): string {
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

async function main(): Promise<void> {
  if (!argv.length) {
    await repl();
    return;
  }
  if (argv[0] === '--version' || argv[0] === '-v') {
    console.log(careerVersion());
    return;
  }
  const ctrl = new AbortController();
  process.once('SIGINT', () => ctrl.abort());
  try {
    const [command, ...args] = argv;
    if (!(await dispatch(command, args, { signal: ctrl.signal }))) {
      console.log(`Comando desconhecido: ${command}`);
      console.log(HELP);
      process.exitCode = 1;
    }
  } catch (err) {
    printError(err);
    process.exitCode = isAbortError(err) ? 130 : err instanceof ProviderNotImplementedError ? 2 : 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
