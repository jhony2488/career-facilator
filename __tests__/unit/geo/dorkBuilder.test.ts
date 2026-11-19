import { buildSearchQueries } from '../../../src/geo/dorkBuilder';
import { makeConfig } from '../../helpers/factories';

describe('buildSearchQueries — queries por mercado e idioma', () => {
  it('gera queries em inglês para portais globais no escopo INTERNATIONAL', () => {
    // feature/08: fontes variam conforme o escopo ativo
    const config = makeConfig({
      marketScope: { ...makeConfig().marketScope, target: 'INTERNATIONAL' },
    });

    const queries = buildSearchQueries(config);

    expect(queries.length).toBeGreaterThan(0);
    expect(queries.some((q: { query: string }) => q.query.includes('site:jobs.lever.co') || q.query.includes('site:boards.greenhouse.io'))).toBe(true);
    expect(queries.some((q: { query: string }) => /remote|worldwide|latam/i.test(q.query))).toBe(true);
  });

  it('gera queries com filtro de região Brasil/LATAM no escopo NATIONAL', () => {
    const config = makeConfig({
      marketScope: { ...makeConfig().marketScope, target: 'NATIONAL' },
    });

    const queries = buildSearchQueries(config);

    expect(queries.some((q: { query: string }) => /brasil|brazil|remoto|gupy/i.test(q.query))).toBe(true);
  });

  it('gera queries para os dois mercados no escopo BOTH', () => {
    // feature/08: BOTH cobre a união dos dois conjuntos
    const config = makeConfig();
    const queries = buildSearchQueries(config);

    const hasIntl = queries.some((q: { query: string }) => /remote|worldwide/i.test(q.query));
    const hasNat = queries.some((q: { query: string }) => /brasil|brazil|gupy|remoto/i.test(q.query));
    expect(hasIntl).toBe(true);
    expect(hasNat).toBe(true);
  });

  it('não gera queries para um mercado desabilitado', () => {
    const config = makeConfig({
      marketScope: {
        ...makeConfig().marketScope,
        target: 'BOTH',
        international: { ...makeConfig().marketScope.international, enabled: false },
      },
    });

    const queries = buildSearchQueries(config);

    expect(queries.every((q: { query: string }) => !/worldwide/i.test(q.query))).toBe(true);
  });
});
