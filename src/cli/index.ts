#!/usr/bin/env node
/**
 * CLI do CareerFacilator AI — entrypoint.
 *
 *   career-facilitator                              # Shell interativo (prompt career>)
 *   career-facilitator import --pdf <caminho>       # Ingestão de perfil via LLM local (doc 13)
 *   career-facilitator import --inbox [--watch]     # Varre/monitora storage/profile_inbox/
 *   career-facilitator run --jobs-file <json> [--dry-run]
 *   career-facilitator review                       # Fila NEEDS_HUMAN_INPUT / READY_TO_REVIEW
 *   career-facilitator mark <url|id> <status>       # Marcação manual (applied/email/whatsapp/…)
 *   career-facilitator remove <url|id>              # Remove a vaga do histórico
 *   career-facilitator login <url>                  # Browser visível p/ login manual no perfil
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
import { JobRepository, type JobStatus } from '../db/repository';
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
import { executeLiveFill } from '../autofill/playwrightExecutor';
import type { Page } from 'playwright';
import { followApplyLink, inspectPage } from '../scraper/pageInspector';
import { loginRefForUrl, parseLoginCredential, tryPortalLogin } from '../autofill/portalLogin';
import { fetchOtp, imapMailbox, parseImapCredential } from '../email_application/otpReader';
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
  '                                            (no shell: marca cada item interativamente)',
  '    mark <url|id> <status>                  applied|email|whatsapp|skipped|failed|',
  '                                            rejected|interview|assessment',
  '    remove <url|id>                         Remove a vaga do histórico (reprocessável no run)',
  '    status                                  Contagens por status no jobs.sqlite',
  '    applied [--limit N]                     Candidaturas enviadas (total por canal, hoje, recentes)',
  '',
  '  Configuração e canais',
  '    config [path|init|get|set|unset|check]  Config global + preflight dos tiers de IA',
  '    vault [list|set|remove <ref>]           Cofre de credenciais (SMTP etc.)',
  '    whatsapp [setup|status]                 Evolution API: instância + QR no terminal',
  '    login <url|portal>                      Browser visível p/ login manual no perfil',
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
      renderText: buildRenderText(),
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
        stealth: effEnv.env.AUTOFILL_STEALTH !== 'false',
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
    humanPace: effEnv.env.AUTOFILL_HUMAN_PACE !== 'false',
  };

  // CAPTCHA/OTP/login → janela visível pro humano resolver na hora (feature/09):
  // em headless reabre o form no mesmo perfil; já visível, só preserva a aba.
  // AUTOFILL_VISIBLE_ON_ESCALATION=false desliga.
  let pendingVisiblePages = 0;
  if (effEnv.env.AUTOFILL_VISIBLE_ON_ESCALATION !== 'false') {
    channelDeps.onHumanEscalation = async ({
      page,
      signal,
      jobUrl,
      matched,
      aiAnswers,
      resumePath,
    }) => {
      if (!page.dom) return false;
      const refill = { matched, aiAnswers, resumePath };
      // Muro de login: 1º tenta credencial do cofre (login-<domínio>) — sem
      // janela humana; sem credencial/falha → abre visível p/ login manual.
      // Enter aqui → reabre a URL da VAGA + refaz o fill.
      if (signal.kind === 'LOGIN_REQUIRED') {
        console.log(`\n⏸ ${signal.detail}`);
        const dom = page.dom as Page;
        const headless = effEnv.env.AUTOFILL_HEADLESS !== 'false';
        let ok = false;
        if (await tryVaultPortalLogin(dom, page.url)) {
          // Autologin feito (headless ou visível) → volta p/ vaga e refaz o fill.
          ok = headless
            ? await relaunchForLogin(jobUrl, refill, ctx, false)
            : await resumeAfterLogin(dom, jobUrl, refill);
        }
        if (!ok) {
          ok = headless
            ? await relaunchForLogin(jobUrl, refill, ctx)
            : await continueAfterLogin(dom, jobUrl, refill, ctx);
        }
        if (!ok) return false;
        pendingVisiblePages++;
        console.log(
          `   Formulário refeito — revise e envie; ` +
            `depois 'mark ${jobUrl} applied' ou 'e' no review.`,
        );
        return true;
      }
      // OTP por e-mail: 1º tenta ler o código na caixa IMAP do cofre
      // (imap-main, ou smtp-main c/ host derivável) e digitar na página.
      if (signal.kind === 'EMAIL_OTP') {
        const otpOk = await tryMailboxOtp(page.dom as Page, page.url, refill);
        if (otpOk) {
          pendingVisiblePages++;
          console.log(
            `   OTP aplicado do e-mail — revise e envie; ` +
              `depois 'mark ${jobUrl} applied' ou 'e' no review.`,
          );
          return true;
        }
      }
      if (effEnv.env.AUTOFILL_HEADLESS === 'false') {
        pendingVisiblePages++;
        console.log(
          `\n⏸ ${signal.detail} — resolva na janela aberta e envie; ` +
            `depois confirme com 'mark ${page.url} applied' ou 'e' no review.`,
        );
        return true;
      }
      console.log(`\n⏸ ${signal.detail} — reabrindo o formulário visível p/ resolução manual…`);
      const reopened = await relaunchEscalationPage(page.url, {
        matched,
        aiAnswers,
        resumePath,
      });
      if (!reopened) return false;
      pendingVisiblePages++;
      console.log(
        `   Resolva no browser e envie — depois 'mark ${page.url} applied' ou 'e' no review.`,
      );
      return true;
    };
  }

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
          renderText: buildRenderText(),
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
    if (pendingVisiblePages > 0) {
      console.log(
        `\n${pendingVisiblePages} formulário(s) aguardando resolução manual — ` +
          `a janela do browser permanece aberta.`,
      );
    } else {
      await shutdownSharedBrowser();
    }
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

// Fontes render:true (SPA como Gupy) — browser persistente reusa o perfil do
// autofill (DISCOVERY_BROWSER_PROFILE_DIR || AUTOFILL_PROFILE_DIR): login
// manual do usuário fica guardado entre runs. Abre só se uma fonte precisar.
const renderCtxOpts = () => ({
  headless: effEnv.env.AUTOFILL_HEADLESS !== 'false',
  profileDir:
    config.discovery.browserProfileDir || effEnv.env.AUTOFILL_PROFILE_DIR?.trim() || undefined,
  stealth: effEnv.env.AUTOFILL_STEALTH !== 'false',
});
let renderCtxPromise: ReturnType<typeof getJobBrowserContext> | null = null;
/** Fecha o browser compartilhado (renderText + pageFactory) e limpa o cache. */
const shutdownSharedBrowser = async (): Promise<void> => {
  renderCtxPromise = null;
  await closeJobBrowser().catch(() => {});
};

/** Enter no terminal (REPL ctx.ask ou readline direto) — também sai no Ctrl+C. */
async function waitHumanSignal(ctx: CmdCtx): Promise<void> {
  const enter = ctx.ask
    ? ctx.ask('')
    : (async () => {
        const { createInterface } = await import('node:readline');
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try {
          await new Promise<void>((res) => rl.question('', () => res()));
        } finally {
          rl.close();
        }
      })();
  await Promise.race([
    enter,
    new Promise<void>((res) => ctx.signal?.addEventListener('abort', () => res(), { once: true })),
  ]);
}

/**
 * CAPTCHA/OTP em modo headless → reabre o formulário VISÍVEL no mesmo perfil
 * (cookies/login persistem e ajudam no desafio). Fecha o contexto headless
 * p/ liberar o SingletonLock do profileDir, relança headed e refaz o
 * preenchimento — o humano só resolve o bloqueio e envia.
 */
async function relaunchEscalationPage(
  url: string,
  refill: Pick<Parameters<typeof executeLiveFill>[1], 'matched' | 'aiAnswers' | 'resumePath'>,
): Promise<boolean> {
  try {
    await shutdownSharedBrowser();
    const ctx = await getJobBrowserContext({
      headless: false,
      profileDir: effEnv.env.AUTOFILL_PROFILE_DIR?.trim() || undefined,
      stealth: effEnv.env.AUTOFILL_STEALTH !== 'false',
    });
    const page = await ctx.newPage();
    const state = await inspectPage(page, url);
    await executeLiveFill(state, {
      ...refill,
      submitMode: 'PAUSE_BEFORE_SUBMIT',
      humanPace: effEnv.env.AUTOFILL_HUMAN_PACE !== 'false',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Credencial do cofre p/ o portal do muro (`login-<domínio>`, ex.: gupy.io →
 * login-gupy). Preenche e submete o signin na própria página — sem janela.
 */
async function tryVaultPortalLogin(dom: Page, loginUrl: string): Promise<boolean> {
  const ref = loginRefForUrl(loginUrl);
  if (!ref) return false;
  const vault = new FileCredentialVault(resolveHome('vault', effEnv.env));
  if (!(await vault.has(ref).catch(() => false))) return false;
  const cred = parseLoginCredential(await vault.getCredential(ref).catch(() => ''));
  if (!cred) return false;
  console.log(`   Credencial '${ref}' no cofre — autenticando no portal…`);
  const ok = await tryPortalLogin(dom, cred);
  if (ok) console.log('   Login automático concluído — sessão reaproveitada no perfil.');
  return ok;
}

/**
 * EMAIL_OTP: lê o código na caixa IMAP do cofre (`imap-main`, ou `smtp-main`
 * c/ host derivável — gmail→imap.gmail.com) e digita no campo OTP da página;
 * link de confirmação é aberto direto. Depois refaz o fill p/ revisão.
 */
async function tryMailboxOtp(
  dom: Page,
  pageUrl: string,
  refill: Pick<Parameters<typeof executeLiveFill>[1], 'matched' | 'aiAnswers' | 'resumePath'>,
): Promise<boolean> {
  const vault = new FileCredentialVault(resolveHome('vault', effEnv.env));
  let credJson: string | null = null;
  for (const ref of ['imap-main', 'smtp-main']) {
    if (await vault.has(ref).catch(() => false)) {
      credJson = await vault.getCredential(ref).catch(() => null);
      if (credJson) break;
    }
  }
  if (!credJson) return false;
  const cred = parseImapCredential(credJson);
  if (!cred) return false;

  try {
    const host = new URL(pageUrl).hostname.toLowerCase();
    const hint = host.split('.').slice(-2).join('.'); // gupy.io, linkedin.com…
    console.log(`   Lendo ${cred.host} p/ o código de ${hint}…`);
    const mailbox = imapMailbox(cred);
    try {
      await mailbox.connect();
      const since = new Date(Date.now() - 10 * 60_000); // OTP foi disparado agora
      const got = await fetchOtp({ mailbox, since, senderHint: hint });
      if (!got) return false;
      if (got.code) {
        const field = dom
          .locator(
            'input[name*="otp" i], input[name*="code" i], input[id*="otp" i], ' +
              'input[autocomplete="one-time-code"]',
          )
          .first();
        if ((await field.count()) === 0) return false;
        await field.clear().catch(() => {});
        await field.pressSequentially(got.code, { delay: 60 });
        const submit = dom.locator('button[type="submit"]').first();
        if ((await submit.count()) > 0) await submit.click().catch(() => {});
        else await field.press('Enter').catch(() => {});
        await dom.waitForTimeout(4000);
      } else if (got.link) {
        await dom
          .goto(got.link, { waitUntil: 'domcontentloaded', timeout: 30_000 })
          .catch(() => {});
        await dom.waitForTimeout(2000);
      }
      // Pós-OTP: o portal segue p/ o form de candidatura — refaz o fill.
      const state = await inspectPage(dom, dom.url());
      await executeLiveFill(state, {
        ...refill,
        submitMode: 'PAUSE_BEFORE_SUBMIT',
        humanPace: effEnv.env.AUTOFILL_HUMAN_PACE !== 'false',
      });
      return true;
    } finally {
      await mailbox.disconnect().catch(() => {});
    }
  } catch {
    return false;
  }
}

/**
 * Após login (cofre ou manual): reabre a URL da vaga, segue o link de
 * candidatura se a página não expõe form, e refaz o preenchimento p/ revisão.
 */
async function resumeAfterLogin(
  dom: Page,
  jobUrl: string,
  refill: Pick<Parameters<typeof executeLiveFill>[1], 'matched' | 'aiAnswers' | 'resumePath'>,
): Promise<boolean> {
  try {
    let state = await inspectPage(dom, jobUrl);
    // Vaga c/ CTA externo (gupy etc.): o form fica atrás do link de candidatura.
    if (state.fields.length === 0) {
      state = (await followApplyLink(dom)) ?? state;
    }
    if (state.requiresLogin || state.hasCaptcha) return false; // login não pegou / challenge — cai p/ manual
    await executeLiveFill(state, {
      ...refill,
      submitMode: 'PAUSE_BEFORE_SUBMIT',
      humanPace: effEnv.env.AUTOFILL_HUMAN_PACE !== 'false',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Humano loga na janela (Enter aqui p/ confirmar) → volta à URL da vaga e
 * refaz o preenchimento p/ revisão+envio manual. Usa a página DOM viva.
 */
async function continueAfterLogin(
  dom: Page,
  jobUrl: string,
  refill: Pick<Parameters<typeof executeLiveFill>[1], 'matched' | 'aiAnswers' | 'resumePath'>,
  ctx: CmdCtx,
): Promise<boolean> {
  try {
    console.log(
      '   Faça login na janela do browser; ao concluir, pressione Enter aqui p/ retomar a candidatura.',
    );
    await waitHumanSignal(ctx);
    return await resumeAfterLogin(dom, jobUrl, refill);
  } catch {
    return false;
  }
}

/**
 * Login wall em headless → relança VISÍVEL no mesmo perfil na URL da vaga
 * (redireciona p/ login). `manual=true`: humano autentica; `false`: o cofre
 * já logou — só refaz o fill visível p/ revisão.
 */
async function relaunchForLogin(
  jobUrl: string,
  refill: Pick<Parameters<typeof executeLiveFill>[1], 'matched' | 'aiAnswers' | 'resumePath'>,
  ctx: CmdCtx,
  manual = true,
): Promise<boolean> {
  try {
    await shutdownSharedBrowser(); // solta o lock do perfil headless
    const browserCtx = await getJobBrowserContext({
      headless: false,
      profileDir: effEnv.env.AUTOFILL_PROFILE_DIR?.trim() || undefined,
      stealth: effEnv.env.AUTOFILL_STEALTH !== 'false',
    });
    const page = await browserCtx.newPage();
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    return manual
      ? await continueAfterLogin(page, jobUrl, refill, ctx)
      : await resumeAfterLogin(page, jobUrl, refill);
  } catch {
    return false;
  }
}

/**
 * `login <url>` — abre o Chromium persistente VISÍVEL na URL do portal e
 * espera (fecha a janela ou Enter aqui). A sessão fica gravada no perfil
 * (DISCOVERY_BROWSER_PROFILE_DIR || AUTOFILL_PROFILE_DIR) e é reaproveitada
 * por fontes render:true e pelo autofill — headless ou não.
 */
/** Portais comuns — `login <portal>` abre direto sem URL completa. */
const LOGIN_PORTALS: Record<string, string> = {
  gupy: 'https://portal.gupy.io',
  linkedin: 'https://www.linkedin.com',
  indeed: 'https://www.indeed.com.br',
  vagas: 'https://www.vagas.com.br',
  infojobs: 'https://www.infojobs.com.br',
  catho: 'https://www.catho.com.br',
};

async function cmdLogin(args: string[], ctx: CmdCtx): Promise<void> {
  const url = LOGIN_PORTALS[args[0]?.toLowerCase() ?? ''] ?? args[0];
  if (!url || !/^https?:\/\//.test(url)) {
    console.log(
      `Uso: login <url|${Object.keys(LOGIN_PORTALS).join('|')}> — abre o browser do perfil ` +
        'p/ login manual (sessão reutilizada nos runs).',
    );
    return;
  }
  const profileDir =
    config.discovery.browserProfileDir || effEnv.env.AUTOFILL_PROFILE_DIR?.trim() || undefined;
  if (!profileDir) {
    console.log(
      'Aviso: sem AUTOFILL_PROFILE_DIR/DISCOVERY_BROWSER_PROFILE_DIR o login não persiste entre runs.',
    );
  }
  const browserCtx = await getJobBrowserContext({
    headless: false,
    profileDir,
    stealth: effEnv.env.AUTOFILL_STEALTH !== 'false',
  });
  const page = await browserCtx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
  console.log(`Browser aberto em ${url} — faça o login. Feche a janela ou pressione Enter.`);
  try {
    await Promise.race([
      new Promise<void>((res) => browserCtx.on('close', () => res())),
      waitHumanSignal(ctx),
    ]);
  } finally {
    await shutdownSharedBrowser();
  }
  console.log('Login salvo no perfil do browser — próximos runs reaproveitam a sessão.');
}
function buildRenderText() {
  return async (url: string) => {
    renderCtxPromise ??= getJobBrowserContext(renderCtxOpts());
    let ctx = await renderCtxPromise;
    // Contexto morto entre comandos do shell (browser fechado no fim do run
    // ou crash) — relança em vez de falhar no newPage.
    try {
      ctx.pages();
    } catch {
      renderCtxPromise = getJobBrowserContext(renderCtxOpts());
      ctx = await renderCtxPromise;
    }
    const page = await ctx.newPage();
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
      return { url: page.url(), text: await page.content(), status: resp?.status() ?? 200 };
    } finally {
      await page.close().catch(() => {});
    }
  };
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
    renderText: buildRenderText(),
  }).finally(() => shutdownSharedBrowser());
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
    renderText: buildRenderText(),
  }).finally(() => shutdownSharedBrowser());
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

/** Ação de canal confirmada manualmente → vira a linha da fila e carimba sent_at. */
const CHANNEL_OF_STATUS: Partial<Record<JobStatus, 'EMAIL' | 'WHATSAPP'>> = {
  APPLIED_VIA_EMAIL: 'EMAIL',
  APPLIED_VIA_WHATSAPP: 'WHATSAPP',
};

/** Aliases aceitos pelo `mark` (minúsculos) — inclui desfechos p/ tracking (doc 12). */
const MARK_ALIASES: Record<string, JobStatus> = {
  applied: 'APPLIED',
  email: 'APPLIED_VIA_EMAIL',
  'applied-email': 'APPLIED_VIA_EMAIL',
  whatsapp: 'APPLIED_VIA_WHATSAPP',
  'applied-whatsapp': 'APPLIED_VIA_WHATSAPP',
  skipped: 'SKIPPED',
  failed: 'FAILED',
  rejected: 'REJECTED',
  interview: 'INTERVIEW',
  assessment: 'ASSESSMENT_INVITED',
};

const MARK_USAGE =
  'Uso: mark <url|id> <status> — status: applied|email|whatsapp|skipped|failed|rejected|interview|assessment';

/** Marcação manual de status — cobre candidaturas feitas fora do funil (docs 10/15). */
async function cmdMark(args: string[]): Promise<void> {
  const [ref, statusArg] = args;
  const status = statusArg ? MARK_ALIASES[statusArg.toLowerCase()] : undefined;
  if (!ref || !status) throw new CliError(MARK_USAGE);

  const repo = openRepo();
  try {
    const job = await repo.findJob(ref);
    if (!job) throw new CliError(`Vaga não encontrada: ${ref}`);
    const channel = CHANNEL_OF_STATUS[status];
    if (channel) await repo.markChannelSent(job.id, channel);
    await repo.updateStatus(job.url, status);
    console.log(`${job.title} — ${job.company}\n  ${job.status} → ${status}`);
  } finally {
    repo.close();
  }
}

/** Remove a vaga do histórico — a URL volta a ser elegível no próximo run. */
async function cmdRemove(args: string[]): Promise<void> {
  const [ref] = args;
  if (!ref) throw new CliError('Uso: remove <url|id>');

  const repo = openRepo();
  try {
    const job = await repo.findJob(ref);
    if (!job) throw new CliError(`Vaga não encontrada: ${ref}`);
    await repo.deleteJob(job.id);
    console.log(`Removida: ${job.title} — ${job.company} (reprocessável no próximo run)`);
  } finally {
    repo.close();
  }
}

/** Ações de uma tecla no review interativo — desfechos ficam no `mark` p/ manter o prompt curto. */
const REVIEW_ACTIONS: Record<string, JobStatus | 'DELETE'> = {
  e: 'APPLIED',
  m: 'APPLIED_VIA_EMAIL',
  w: 'APPLIED_VIA_WHATSAPP',
  p: 'SKIPPED',
  f: 'FAILED',
  x: 'DELETE',
};

function printWhatsappQueueItem(q: {
  jobId: string;
  recipient: string;
  subject: string | null;
  attachmentPath: string | null;
}): void {
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

/**
 * Fila de ação humana. No shell interativo pergunta o desfecho de cada item —
 * fora dele (comando direto) só lista e aponta mark/remove.
 */
async function cmdReview(ctx: CmdCtx = {}): Promise<void> {
  const repo = openRepo();
  const pending = [
    ...(await repo.listByStatus('NEEDS_HUMAN_INPUT')),
    ...(await repo.listByStatus('READY_TO_REVIEW')),
  ];
  const whatsappQueue = await repo.listWhatsappQueue();
  if (!pending.length && !whatsappQueue.length) {
    repo.close();
    console.log('Fila vazia — nenhuma candidatura pendente de ação humana.');
    return;
  }

  const queueByJob = new Map(whatsappQueue.map((q) => [q.jobId, q]));
  const orphanQueue = whatsappQueue.filter((q) => !pending.some((j) => j.id === q.jobId));

  if (!ctx.ask) {
    if (pending.length) {
      console.log(`${pending.length} candidatura(s) aguardando você:`);
      for (const j of pending) {
        console.log(`  [${j.status}] ${j.title} — ${j.company}\n    ${j.url}`);
      }
    }
    if (whatsappQueue.length) {
      console.log(`\n${whatsappQueue.length} candidatura(s) por WhatsApp para enviar na mão:`);
      for (const q of whatsappQueue) printWhatsappQueueItem(q);
    }
    repo.close();
    console.log(
      "\nDica: no shell interativo ('npm run cli') o review marca cada item — " +
        "ou use 'mark <url|id> <status>' e 'remove <url|id>'.",
    );
    return;
  }

  try {
    console.log(
      `${pending.length} candidatura(s) aguardando você ` +
        `— 'e' marca APPLIED só depois de concluir o envio no navegador.`,
    );
    for (const j of pending) {
      if (ctx.signal?.aborted) break;
      console.log(`\n  [${j.status}] ${j.title} — ${j.company}\n    ${j.url}`);
      const q = queueByJob.get(j.id);
      if (q) {
        console.log(`    WhatsApp: wa.me/${q.recipient}`);
        if (q.subject)
          console.log(
            `    Mensagem:\n${q.subject
              .split('\n')
              .map((l) => `      ${l}`)
              .join('\n')}`,
          );
        if (q.attachmentPath) console.log(`    Anexar: ${q.attachmentPath}`);
      }
      const answer = (
        await ctx.ask(
          '    ação? [enter] manter · e=enviei(web) · m=enviei e-mail · w=enviei whatsapp · p=pular · f=falhou · x=excluir: ',
        )
      )
        .trim()
        .toLowerCase();
      if (!answer) continue;
      const action = REVIEW_ACTIONS[answer];
      if (!action) {
        console.log('    (mantida — tecla não reconhecida)');
        continue;
      }
      if (action === 'DELETE') {
        await repo.deleteJob(j.id);
        console.log('    → removida do histórico');
        continue;
      }
      const channel = CHANNEL_OF_STATUS[action];
      if (channel) await repo.markChannelSent(j.id, channel);
      await repo.updateStatus(j.url, action);
      console.log(`    → ${action}`);
    }

    if (orphanQueue.length) {
      console.log(`\n${orphanQueue.length} candidatura(s) por WhatsApp para enviar na mão:`);
      for (const q of orphanQueue) {
        printWhatsappQueueItem(q);
        console.log(`    (confirme o envio com 'mark ${q.jobId} whatsapp')`);
      }
    }
  } finally {
    repo.close();
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
      // Credencial de portal (autologin em muros de login — doc 10):
      // `login-<domínio>` → {user, pass} — ex.: login-gupy p/ *.gupy.io/signin.
      if (ref.startsWith('login-')) {
        const user = (await ctx.ask(`Usuário/e-mail do portal (${ref.slice(6)}): `)).trim();
        const pass = (await ctx.ask('Senha do portal: ')).trim();
        await vault.setCredential(ref, JSON.stringify({ user, pass }));
        console.log(
          `Credencial '${ref}' gravada criptografada — login walls de ${ref.slice(6)} ` +
            `passam a autenticar sozinhos nas candidaturas.`,
        );
        return;
      }
      // Credencial IMAP (leitura de OTP — doc 10): `imap-<x>` → {host,port,secure,user,pass}.
      if (ref.startsWith('imap-')) {
        const host = (await ctx.ask('IMAP host (imap.gmail.com / outlook.office365.com): ')).trim();
        const portStr = (await ctx.ask('IMAP port (993 = TLS direto): ')).trim();
        const user = (await ctx.ask('Usuário (seu e-mail completo): ')).trim();
        const pass = (await ctx.ask('Senha de app (mesma do SMTP no Gmail/Outlook): ')).trim();
        await vault.setCredential(
          ref,
          JSON.stringify({ host, port: Number(portStr) || 993, secure: true, user, pass }),
        );
        console.log(
          `Credencial '${ref}' gravada criptografada — OTPs de e-mail passam a ser ` +
            `lidos sozinhos da caixa ${host}.`,
        );
        return;
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
      await cmdReview(ctx);
      return true;
    case 'mark':
      await cmdMark(args);
      return true;
    case 'remove':
      await cmdRemove(args);
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
    case 'login':
      await cmdLogin(args, ctx);
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
  // Linha digitada com pergunta pendente é a resposta — não um comando novo.
  // E comando em curso enfileira a entrada: respostas pré-digitadas chegam à
  // pergunta seguinte e Ctrl+C continua abortando o comando certo.
  let pendingAsk: ((answer: string) => void) | null = null;
  let busy = false;
  const inputQueue: string[] = [];
  const drainInput = () => {
    while (inputQueue.length && !pendingAsk && !busy && !closed)
      runLine(inputQueue.shift() as string);
  };
  const runLine = (line: string): void => {
    const [cmd, ...cmdArgs] = line.trim().split(/\s+/).filter(Boolean);
    if (!cmd) return;
    if (cmd === 'exit' || cmd === 'quit' || cmd === 'q') {
      rl.close();
      return;
    }
    if (cmd === 'help' || cmd === '?') {
      console.log(HELP);
      return;
    }
    busy = true;
    void (async () => {
      const ctrl = new AbortController();
      current = ctrl;
      const ask = (q: string) =>
        new Promise<string>((res) => {
          process.stdout.write(q);
          const pretyped = inputQueue.shift();
          if (pretyped !== undefined) {
            res(pretyped);
            return;
          }
          pendingAsk = res;
          ctrl.signal.addEventListener(
            'abort',
            () => {
              if (pendingAsk === res) {
                pendingAsk = null;
                res('');
              }
            },
            { once: true },
          );
        });
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
      busy = false;
      if (!closed) rl.prompt();
      drainInput();
    });
  };
  rl.on('line', (line) => {
    if (pendingAsk) {
      const resolve = pendingAsk;
      pendingAsk = null;
      resolve(line);
      return;
    }
    if (busy) {
      inputQueue.push(line);
      return;
    }
    runLine(line);
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
