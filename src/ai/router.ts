import type { CareerOpsConfig, ModelRouting } from '../config/careerOps.config';
import { defaultCareerOpsConfig } from '../config/careerOps.config';

export type ModelTier = 'LOCAL' | 'FAST' | 'SMART';

export interface ResolvedModel {
  provider: string;
  modelId: string;
}

const TIER_KEY: Record<ModelTier, 'local' | 'fast' | 'smart'> = {
  LOCAL: 'local',
  FAST: 'fast',
  SMART: 'smart',
};

/**
 * Roteamento híbrido de modelos (doc 02/03): provider/modelId vêm de
 * `config.ai.{local,fast,smart}` — configurável por tier sem tocar no código.
 */
export function resolveModel(tier: ModelTier, config: CareerOpsConfig): ResolvedModel {
  const routing: ModelRouting =
    config.ai?.[TIER_KEY[tier]] ?? defaultCareerOpsConfig.ai[TIER_KEY[tier]];
  return { provider: routing.provider, modelId: routing.modelId };
}
