import {
  COMMON_VIEWPORTS,
  humanPathTo,
  pickViewport,
  randInt,
  typeDelayFor,
} from '../../../src/utils/humanSim';

// Seeded LCG — deterministic sequences for pure-function assertions.
const seeded = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
};

describe('humanSim — randInt', () => {
  it('always lands inside [min, max]', () => {
    for (const rng of [Math.random, seeded(42), () => 0, () => 0.999]) {
      for (let i = 0; i < 50; i++) {
        const v = randInt(3, 7, rng);
        expect(v).toBeGreaterThanOrEqual(3);
        expect(v).toBeLessThanOrEqual(7);
      }
    }
  });
});

describe('humanSim — pickViewport', () => {
  it('only returns entries from COMMON_VIEWPORTS', () => {
    const rng = seeded(7);
    for (let i = 0; i < 20; i++) {
      expect(COMMON_VIEWPORTS).toContainEqual(pickViewport(rng));
    }
  });
});

describe('humanSim — humanPathTo', () => {
  it('ends exactly at the target and produces 3-6 waypoints', () => {
    const rng = seeded(99);
    for (let i = 0; i < 30; i++) {
      const to = { x: 500, y: 300 };
      const path = humanPathTo({ x: 0, y: 0 }, to, rng);
      expect(path.length).toBeGreaterThanOrEqual(3);
      expect(path.length).toBeLessThanOrEqual(6);
      expect(path[path.length - 1]).toEqual(to);
    }
  });

  it('jitter keeps points near the straight line', () => {
    const rng = seeded(1);
    const path = humanPathTo({ x: 0, y: 0 }, { x: 100, y: 0 }, rng);
    for (const p of path.slice(0, -1)) {
      expect(Math.abs(p.y)).toBeLessThanOrEqual(40);
      expect(p.x).toBeGreaterThanOrEqual(-5);
      expect(p.x).toBeLessThanOrEqual(105);
    }
  });
});

describe('humanSim — typeDelayFor', () => {
  it('decreases per-char delay for longer strings', () => {
    const short = typeDelayFor(10, () => 0.5);
    const long = typeDelayFor(500, () => 0.5);
    expect(long).toBeLessThan(short);
  });

  it('stays within human-typing bounds (8–50ms/char)', () => {
    for (const len of [1, 10, 100, 1000]) {
      const d = typeDelayFor(len, () => 0.5);
      expect(d).toBeGreaterThanOrEqual(4);
      expect(d).toBeLessThanOrEqual(50);
    }
  });
});
