import type { CareerOpsConfig } from '../config/careerOps.config';
import { JOB_SOURCES } from './registry';
import type { JobSource } from './types';

export interface ActiveSourceFilters {
  sourceIds?: string[];
  regions?: string[];
  includeRisky?: boolean;
  includeAuth?: boolean;
}

export function getActiveSources(
  config: CareerOpsConfig,
  filters: ActiveSourceFilters = {},
): JobSource[] {
  const explicit = new Set(
    filters.sourceIds?.length ? filters.sourceIds : (config.discovery.sources ?? []),
  );
  const excluded = new Set(config.discovery.excludeSources ?? []);

  return JOB_SOURCES.filter((s) => {
    if (excluded.has(s.id)) return false;
    const explicitlyRequested = explicit.size > 0 && explicit.has(s.id);
    if (explicit.size > 0 && !explicit.has(s.id)) return false;

    if (!explicitlyRequested && !s.enabled) return false;
    if (s.risky && !(filters.includeRisky ?? false)) return false;
    if (s.requiresAuth && !(filters.includeAuth ?? false)) return false;

    if (filters.regions?.length) {
      const matches = s.regions.some((r) => filters.regions!.includes(r));
      if (!matches) return false;
    }
    if (config.discovery.regions?.length) {
      const matches = s.regions.some((r) => config.discovery.regions!.includes(r));
      if (!matches) return false;
    }
    if (config.discovery.workModels?.length && s.workModels?.length) {
      const matches = s.workModels.some((w) => config.discovery.workModels!.includes(w));
      if (!matches) return false;
    }

    return true;
  });
}

export function listSources(config?: CareerOpsConfig): JobSource[] {
  if (!config) return JOB_SOURCES;
  return JOB_SOURCES;
}
