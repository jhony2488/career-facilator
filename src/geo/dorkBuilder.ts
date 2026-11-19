import type { CareerOpsConfig } from '../config/careerOps.config';

export interface SearchQuery {
  engine: 'GOOGLE_DORK' | 'ATS_DIRECT' | 'AGGREGATOR';
  query: string;
  source: string;
}

const INTL_STACK_TERMS = '"TypeScript" OR "Node.js" OR "React"';
const NAT_STACK_TERMS = '"TypeScript" OR "Node.js" OR "React"';

/** Queries de busca específicas por mercado e idioma (doc 08, feature/01, 08). */
export function buildSearchQueries(config: CareerOpsConfig): SearchQuery[] {
  const queries: SearchQuery[] = [];
  const scope = config.marketScope;

  if (
    scope.international.enabled &&
    (scope.target === 'INTERNATIONAL' || scope.target === 'BOTH')
  ) {
    const regions = scope.international.regions.join(' OR ');
    queries.push(
      {
        engine: 'GOOGLE_DORK',
        source: 'lever',
        query: `site:jobs.lever.co ${INTL_STACK_TERMS} remote (${regions.toLowerCase()})`,
      },
      {
        engine: 'GOOGLE_DORK',
        source: 'greenhouse',
        query: `site:boards.greenhouse.io ${INTL_STACK_TERMS} "remote" worldwide`,
      },
      {
        engine: 'GOOGLE_DORK',
        source: 'ashby',
        query: `site:jobs.ashbyhq.com ${INTL_STACK_TERMS} remote`,
      },
      { engine: 'AGGREGATOR', source: 'remoteok', query: `${INTL_STACK_TERMS} remote worldwide` },
      {
        engine: 'AGGREGATOR',
        source: 'linkedin-global',
        query: `${INTL_STACK_TERMS} remote LATAM contractor`,
      },
    );
  }

  if (scope.national.enabled && (scope.target === 'NATIONAL' || scope.target === 'BOTH')) {
    queries.push(
      { engine: 'AGGREGATOR', source: 'gupy', query: `${NAT_STACK_TERMS} remoto Brasil` },
      {
        engine: 'AGGREGATOR',
        source: 'linkedin-brasil',
        query: `${NAT_STACK_TERMS} remoto Brasil`,
      },
      { engine: 'AGGREGATOR', source: 'geekhunter', query: `${NAT_STACK_TERMS} remoto` },
      { engine: 'AGGREGATOR', source: 'programathor', query: `${NAT_STACK_TERMS} remoto` },
      {
        engine: 'GOOGLE_DORK',
        source: 'greenhouse',
        query: `site:boards.greenhouse.io ${NAT_STACK_TERMS} (Brasil OR Brazil OR LATAM) remote`,
      },
    );
  }

  return queries;
}
