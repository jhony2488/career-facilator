#!/usr/bin/env node
/**
 * CLI do CareerFacilator AI — entrypoint.
 *
 * Comandos planejados (doc 12):
 *   career-facilitator import --pdf <caminho>   # Ingestão de perfil (doc 13)
 *   career-facilitator run [--dry-run]          # Executa o funil completo
 *   career-facilitator review                   # Fila de NEEDS_HUMAN_INPUT
 *   career-facilitator status                   # Resumo do SQLite + tokens
 */

import { importResume } from '../intake/intakeCore';
import { createNodePdfReader } from '../intake/pdfReaderNode';
import { MasterProfileStore } from '../intake/masterProfileStore';
import { defaultCareerOpsConfig } from '../config/careerOps.config';
import { createNodeFileStore } from '../intake/nodeFileStore';
import { makeEmptyProfile } from '../intake/profileStructurer';
import type { StructurerModel } from '../intake/profileStructurer';

const [command, ...args] = process.argv.slice(2);

/**
 * Modelo de estruturação ainda não configurado: devolve perfil todo
 * NÃO_INFORMADO (anti-fabricação — nada é inventado). Substituir pelo router
 * de modelos quando a camada de IA estiver integrada.
 */
function createStubModel(): StructurerModel {
  return {
    generate: async (_prompt: string) => {
      console.warn('AVISO: modelo de estruturação não configurado — rascunho mínimo gerado.');
      return makeEmptyProfile();
    },
  };
}

async function main(): Promise<void> {
  switch (command) {
    case 'import': {
      const pdfIdx = args.indexOf('--pdf');
      const pdfPath = pdfIdx === -1 ? args[0] : args[pdfIdx + 1];
      if (!pdfPath) {
        console.error('Uso: career-facilitator import --pdf <caminho>');
        process.exit(1);
      }
      const cfg = defaultCareerOpsConfig.profile;
      const store = new MasterProfileStore(
        { draftPath: cfg.draftPath, masterPath: cfg.masterPath, historyDir: cfg.historyDir },
        { fs: createNodeFileStore() },
      );
      const result = await importResume(
        { file: { path: pdfPath }, mode: 'MERGE', source: 'CLI' },
        { reader: createNodePdfReader(), model: createStubModel(), store },
      );
      if (result.outcome === 'UNREADABLE_DOCUMENT') {
        console.error(result.alert);
        process.exit(1);
      }
      console.log(`Rascunho gerado em ${result.draftPath} — revise antes de aprovar.`);
      if (result.conflicts?.length) {
        console.log(`Conflitos a decidir: ${result.conflicts.map((c) => c.field).join(', ')}`);
      }
      break;
    }
    case 'run': {
      const dryRun = args.includes('--dry-run');
      console.log(`Execução do funil${dryRun ? ' (dry-run — nada será enviado)' : ''}.`);
      console.log(
        'Configure as dependências (repo, modelos, página) e invoque runApplicationPipeline.',
      );
      break;
    }
    case 'review': {
      console.log(
        'Fila de candidaturas pendentes de ação humana: ver tabela jobs com status NEEDS_HUMAN_INPUT.',
      );
      break;
    }
    case 'status': {
      console.log('Resumo de execução: ver ai_usage_logs e jobs no SQLite.');
      break;
    }
    default: {
      console.log(
        'CareerFacilator AI — comandos: import --pdf <caminho> | run [--dry-run] | review | status',
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
