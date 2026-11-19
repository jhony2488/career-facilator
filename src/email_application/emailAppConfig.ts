import type { EmailDispatchMode } from './emailDispatcher';

/** Configuração declarativa do módulo de candidatura por e-mail (doc e-mail §5). */
export interface EmailAppConfig {
  enabled: boolean;
  dispatchMode: EmailDispatchMode;
  minScoreAutoSend: number;
  attachTailoredResume: boolean;
  maxDailyEmails: number;
  smtpCredentialRef: string;
  recipientCooldownDays: number;
}

export const defaultEmailAppConfig: EmailAppConfig = {
  enabled: true,
  dispatchMode: 'HYBRID_BY_SCORE',
  minScoreAutoSend: 88,
  attachTailoredResume: true,
  maxDailyEmails: 10,
  smtpCredentialRef: 'smtp-main',
  recipientCooldownDays: 30,
};
