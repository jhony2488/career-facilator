import type { CareerOpsConfig, ExecutionMode } from '../config/careerOps.config';

export type ApplicationRoute = 'AUTO_SEND' | 'REVIEW' | 'DEFER' | 'ESCALATE';

export interface AutonomySignals {
  hasCaptcha: boolean;
  hasLowConfidenceAnswers: boolean;
}

export interface AutonomyInput {
  fitScore: number;
  mode: ExecutionMode;
  signals: AutonomySignals;
  config: CareerOpsConfig;
  dailyCount: number;
}

/**
 * Motor de decisão de autonomia (doc 07, feature/07): régua modo×score com
 * travas de segurança — CAPTCHA escala, baixa confiança revisa, limite diário defere.
 */
export function decideApplicationRoute(input: AutonomyInput): ApplicationRoute {
  const { fitScore, mode, signals, config, dailyCount } = input;
  const { minScoreForFullAuto, maxDailyApplications } = config.execution;

  if (signals.hasCaptcha) return 'ESCALATE';
  if (dailyCount >= maxDailyApplications) return 'DEFER';

  const meetsAutoBar = fitScore >= minScoreForFullAuto;

  switch (mode) {
    case 'SEMI_AUTO':
      return 'REVIEW';
    case 'FULL_AUTO':
      if (!meetsAutoBar) return 'REVIEW';
      return signals.hasLowConfidenceAnswers ? 'REVIEW' : 'AUTO_SEND';
    case 'HYBRID_THRESHOLD':
      if (!meetsAutoBar) return 'REVIEW';
      return signals.hasLowConfidenceAnswers ? 'REVIEW' : 'AUTO_SEND';
  }
}
