#!/usr/bin/env node
/**
 * CLI do CareerFacilator AI — entrypoint.
 *
 *   career-facilitator import --pdf <caminho>      # Ingestão de perfil via LLM local (doc 13)
 *   career-facilitator run --jobs-file <json> [--dry-run]
 *   career-facilitator review                      # Fila NEEDS_HUMAN_INPUT / READY_TO_REVIEW
 *   career-facilitator status                      # Resumo do SQLite
 *   career-facilitator config                      # Roteamento de modelos resolvido do .env
 */

import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { importResume } from '../intake/intakeCore';
import { createNodePdfReader } from '../intake/pdfReaderNode';
import { MasterProfileStore } from '../intake/masterProfileStore';
import { loadCareerOpsConfig } from '../config/loadConfig';
import { createNodeFileStore } from '../intake/nodeFileStore';
import { createModelClients, createEmbedder, ProviderNotImplementedError } from '../ai/modelFactory';
import { createOllamaClient } from '../ai/ollamaClient';
import { JobRepository } from '../db/repository';
import { runApplicationPipeline } from '../core/pipeline';
import { retrieveHybrid } from '../ai/rag/profileRetriever';
import { loadSkillRegistry } from '../skills/core/skillRegistry';
import type { MasterProfileLike } from '../core/types';
import type { PageStateLike } from '../autofill/formExecutor';

const [command, ...args] = process.argv.slice(2);
const config = loadCareerOpsConfig();
const DB_PATH = 'storage/jobs.sqlite';

/** Stream de tokens no terminal apenas quando verbose. */
const streamTokens = args.includes('--verbose')
  ? (t: string) => process.stdout.write(t)
  : undefined;

async function requireOllama(baseUrl: string | undefined, modelId: string): Promise<boolean> {
  const probe = createOllamaClient({ baseUrl });
  if (await probe.isReachable()) return true;
  console.error(
    `Ollama offline em ${baseUrl ?? 'http://localhost:11434'}. ` +
      `Rode 'ollama serve' e 'ollama pull ${modelId}'.`,
  );
  return false;
}

function openRepo(): JobRepository {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  return new JobRepository(DB_PATH);
}

function loadMasterProfile(): MasterProfileLike {
  const compiled = config.profile.compiledPath;
  if (!existsSync(compiled)) {
    console.error(`Perfil compilado não encontrado em ${compiled} — rode 'import --pdf' e aprove o rascunho.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(compiled, 'utf8')) as MasterProfileLike;
}

async function cmdImport(): Promise<void> {
  const pdfIdx = args.indexOf('--pdf');
  const pdfPath = pdfIdx === -1 ? args[0] : args[pdfIdx + 1];
  if (!pdfPath) {
    console.error('Uso: career-facilitator import --pdf <caminho>');
    process.exit(1);
  }

  const { smart } = config.ai;
  if (smart.provider === 'ollama' && !(await requireOllama(smart.baseUrl, smart.modelId))) {
    process.exit(1);
  }

  let clients;
  try {
    clients = createModelClients(config, { onToken: streamTokens });
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const cfg = config.profile;
  const store = new MasterProfileStore(
    { draftPath: cfg.draftPath, masterPath: cfg.masterPath, historyDir: cfg.historyDir },
    { fs: createNodeFileStore() },
  );
  console.log(`Estruturando ${resolve(pdfPath)} via ${smart.provider}/${smart.modelId}…`);
  const result = await importResume(
    { file: { path: pdfPath }, mode: 'MERGE', source: 'CLI' },
    { reader: createNodePdfReader(), model: clients.structurerModel, store },
  );
  if (result.outcome === 'UNREADABLE_DOCUMENT') {
    console.error(result.alert);
    process.exit(1);
  }
  console.log(`\nRascunho gerado em ${result.draftPath} — revise antes de aprovar.`);
  if (result.conflicts?.length) {
    console.log(`Conflitos a decidir: ${result.conflicts.map((c) => c.field).join(', ')}`);
  }
}

async function cmdRun(): Promise<void> {
  const fileIdx = args.indexOf('--jobs-file');
  const jobsPath = fileIdx === -1 ? undefined : args[fileIdx + 1];
  const dryRun = args.includes('--dry-run');

  if (!jobsPath) {
    console.log('Uso: career-facilitator run --jobs-file <caminho.json> [--dry-run]');
    console.log('Formato do arquivo: [{"url": "https://…/vaga", "html": "<html da página>"}, …]');
    return;
  }

  const rawJobs = JSON.parse(readFileSync(resolve(jobsPath), 'utf8')) as {
    url: string;
    html: string;
  }[];
  const profile = loadMasterProfile();

  if (config.ai.local.provider === 'ollama' &&
      !(await requireOllama(config.ai.local.baseUrl, config.ai.local.modelId))) {
    process.exit(1);
  }

  const clients = createModelClients(config, { onToken: streamTokens });
  const embedder = createEmbedder(config);
  const skills = await loadSkillRegistry(resolve('src/skills/library')).catch(() => []);
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

  const result = await runApplicationPipeline(
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
  repo.close();

  console.log(`\n${result.processed} vaga(s) processada(s):`);
  for (const a of result.applications) {
    console.log(`  ${a.status.padEnd(20)} ${a.fitScore ?? '—'} ${a.url}${a.reason ? ` (${a.reason})` : ''}`);
  }
  console.log(
    `Chamadas de modelo: triagem=${result.tokenReport.triageCalls} smart=${result.tokenReport.smartTierCalls}`,
  );
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

function cmdConfig(): void {
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
}

async function main(): Promise<void> {
  try {
    switch (command) {
      case 'import':
        return await cmdImport();
      case 'run':
        return await cmdRun();
      case 'review':
        return await cmdReview();
      case 'status':
        return await cmdStatus();
      case 'config':
        return cmdConfig();
      default:
        console.log(
          'CareerFacilator AI — comandos: import --pdf <caminho> | run --jobs-file <json> [--dry-run] [--verbose] | review | status | config',
        );
    }
  } catch (err) {
    if (err instanceof ProviderNotImplementedError) {
      console.error(err.message);
      process.exit(2);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
