import { snapshotToState, type PageSnapshot } from '../../../src/scraper/pageInspector';

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
