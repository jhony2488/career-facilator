import { buildSearchQueries } from '../../../src/geo/dorkBuilder';
import { makeConfig } from '../../helpers/factories';

describe('buildSearchQueries — queries per market and language', () => {
  it('generates English queries for global job boards under the INTERNATIONAL scope', () => {
    // feature/08: sources vary according to the active scope
    const config = makeConfig({
      marketScope: { ...makeConfig().marketScope, target: 'INTERNATIONAL' },
    });

    const queries = buildSearchQueries(config);

    expect(queries.length).toBeGreaterThan(0);
    expect(
      queries.some(
        (q: { query: string }) =>
          q.query.includes('site:jobs.lever.co') || q.query.includes('site:boards.greenhouse.io'),
      ),
    ).toBe(true);
    expect(queries.some((q: { query: string }) => /remote|worldwide|latam/i.test(q.query))).toBe(
      true,
    );
  });

  it('generates queries with a Brazil/LATAM region filter under the NATIONAL scope', () => {
    const config = makeConfig({
      marketScope: { ...makeConfig().marketScope, target: 'NATIONAL' },
    });

    const queries = buildSearchQueries(config);

    expect(queries.some((q: { query: string }) => /brasil|brazil|remoto|gupy/i.test(q.query))).toBe(
      true,
    );
  });

  it('generates queries for both markets under the BOTH scope', () => {
    // feature/08: BOTH covers the union of the two sets
    const config = makeConfig();
    const queries = buildSearchQueries(config);

    const hasIntl = queries.some((q: { query: string }) => /remote|worldwide/i.test(q.query));
    const hasNat = queries.some((q: { query: string }) =>
      /brasil|brazil|gupy|remoto/i.test(q.query),
    );
    expect(hasIntl).toBe(true);
    expect(hasNat).toBe(true);
  });

  it('does not generate queries for a disabled market', () => {
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
