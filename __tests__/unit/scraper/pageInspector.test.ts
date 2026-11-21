import {
  mergeSnapshots,
  snapshotToState,
  type PageSnapshot,
} from '../../../src/scraper/pageInspector';

const snap: PageSnapshot = {
  fields: [
    {
      kind: 'input',
      label: 'Full name',
      required: true,
      selector: '[data-cf-idx="0"]',
      name: 'name',
    },
    { kind: 'file', label: 'Resume', required: true, selector: '[data-cf-idx="1"]', name: 'cv' },
  ],
  hasCaptcha: true,
  requiresEmailOtp: false,
  alreadyAppliedBanner: false,
  validationErrors: ['Nome é obrigatório'],
  currentStep: 2,
  totalSteps: 3,
  isShadowDom: true,
};

describe('snapshotToState', () => {
  it('maps a DOM snapshot into PageStateLike with fields/signals copied', () => {
    const state = snapshotToState(snap, 'https://x.job');
    expect(state.url).toBe('https://x.job');
    expect(state.fields).toHaveLength(2);
    expect(state.fields[0].selector).toBe('[data-cf-idx="0"]');
    expect(state.hasCaptcha).toBe(true);
    expect(state.validationErrors).toEqual(['Nome é obrigatório']);
    expect(state.currentStep).toBe(2);
    expect(state.totalSteps).toBe(3);
    expect(state.submitted).toBe(false);
    expect(state.dom).toBeUndefined();
  });

  it('attaches the opaque dom handle when provided', () => {
    const fakeDom = { close: async () => {} };
    const state = snapshotToState(snap, 'https://x.job', fakeDom);
    expect(state.dom).toBe(fakeDom);
  });
});

describe('mergeSnapshots — multi-frame inspection', () => {
  const base: PageSnapshot = {
    fields: [],
    hasCaptcha: false,
    requiresEmailOtp: false,
    alreadyAppliedBanner: false,
    validationErrors: [],
    currentStep: 1,
    totalSteps: 1,
    isShadowDom: false,
  };

  it('stamps frameIdx on fields and dropzones collected per frame', () => {
    const merged = mergeSnapshots([
      {
        frameIdx: 0,
        snap: {
          ...base,
          fields: [
            { kind: 'input', label: 'Name', required: true, selector: 'a', name: 'n' },
          ],
        },
      },
      {
        frameIdx: 1,
        snap: {
          ...base,
          fields: [
            { kind: 'input', label: 'Email', required: true, selector: 'b', name: 'e' },
          ],
          dropzones: [{ selector: 'dz' }],
        },
      },
    ]);
    expect(merged.fields.map((f) => f.label)).toEqual(['Name', 'Email']);
    expect(merged.fields.map((f) => f.frameIdx)).toEqual([0, 1]);
    expect(merged.dropzones).toEqual([{ selector: 'dz', frameIdx: 1 }]);
  });

  it('ORs blocking signals across frames and caps deduped errors at 5', () => {
    const snapWith = (over: Partial<PageSnapshot>): PageSnapshot => ({ ...base, ...over });
    const merged = mergeSnapshots([
      { frameIdx: 0, snap: snapWith({ validationErrors: ['e1', 'e2', 'e3', 'e4', 'e5'] }) },
      {
        frameIdx: 1,
        snap: snapWith({ hasCaptcha: true, validationErrors: ['e5', 'e6', 'e7'] }),
      },
    ]);
    expect(merged.hasCaptcha).toBe(true);
    expect(merged.validationErrors).toEqual(['e1', 'e2', 'e3', 'e4', 'e5']);
  });

  it('keeps step counters from the main frame (frameIdx 0)', () => {
    const merged = mergeSnapshots([
      { frameIdx: 0, snap: { ...base, currentStep: 2, totalSteps: 3 } },
      { frameIdx: 1, snap: { ...base, currentStep: 1, totalSteps: 1 } },
    ]);
    expect(merged.currentStep).toBe(2);
    expect(merged.totalSteps).toBe(3);
  });
});
