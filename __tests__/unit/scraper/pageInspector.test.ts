import {
  mergeSnapshots,
  pickApplyTarget,
  followApplyLink,
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
          fields: [{ kind: 'input', label: 'Name', required: true, selector: 'a', name: 'n' }],
        },
      },
      {
        frameIdx: 1,
        snap: {
          ...base,
          fields: [{ kind: 'input', label: 'Email', required: true, selector: 'b', name: 'e' }],
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

describe('pickApplyTarget — apply link selection', () => {
  const base = 'https://company.example/jobs/dev';

  it('prefers a link pointing at a known ATS host over generic text', () => {
    const target = pickApplyTarget(
      [
        { text: 'Apply for this job', href: 'https://company.example/form' },
        { text: 'Careers', href: 'https://boards.greenhouse.io/acme/jobs/123' },
      ],
      base,
    );
    expect(target).toBe('https://boards.greenhouse.io/acme/jobs/123');
  });

  it('follows a PT apply link on a non-ATS host', () => {
    const target = pickApplyTarget([{ text: 'Candidate-se', href: '/inscricao/123' }], base);
    expect(target).toBe('https://company.example/inscricao/123');
  });

  it('follows an /apply path even when the link text is generic', () => {
    const target = pickApplyTarget([{ text: 'company portal', href: '/jobs/dev/apply' }], base);
    expect(target).toBe('https://company.example/jobs/dev/apply');
  });

  it('follows localized apply paths beyond English', () => {
    expect(
      pickApplyTarget([{ text: 'ver mais', href: '/postuler/offre/7' }], base),
    ).toBe('https://company.example/postuler/offre/7');
    expect(
      pickApplyTarget([{ text: 'saiba mais', href: '/trabalhe-conosco/dev' }], base),
    ).toBe('https://company.example/trabalhe-conosco/dev');
  });

  it('recognizes join.com as an ATS host', () => {
    const target = pickApplyTarget(
      [{ text: 'View job', href: 'https://join.com/companies/acme/123-backend' }],
      base,
    );
    expect(target).toBe('https://join.com/companies/acme/123-backend');
  });

  it('prefers a known ATS host over an /apply path', () => {
    const target = pickApplyTarget(
      [
        { text: 'company portal', href: '/jobs/dev/apply' },
        { text: 'Careers', href: 'https://boards.greenhouse.io/acme/jobs/9' },
      ],
      base,
    );
    expect(target).toBe('https://boards.greenhouse.io/acme/jobs/9');
  });

  it('skips mailto/self/javascript links and returns null', () => {
    const target = pickApplyTarget(
      [
        { text: 'Apply by email', href: 'mailto:jobs@acme.com' },
        { text: 'Apply', href: 'javascript:void(0)' },
        { text: 'Apply', href: base },
      ],
      base,
    );
    expect(target).toBeNull();
  });
});

describe('followApplyLink — one-hop apply navigation', () => {
  function fakePage(opts: { anchors: { text: string; href: string }[]; snap?: PageSnapshot }) {
    const frame = {
      evaluate: jest.fn(async () => opts.snap ?? emptySnap()),
    };
    return {
      url: () => 'https://company.example/jobs/dev',
      evaluate: jest.fn(async () => ({ anchors: opts.anchors, hasButton: false })),
      goto: jest.fn(async () => {}),
      frames: () => [frame],
      context: () => ({ waitForEvent: jest.fn() }),
      getByRole: jest.fn(() => ({ first: () => ({ click: jest.fn() }) })),
      waitForNavigation: jest.fn(async () => {
        throw new Error('timeout');
      }),
      close: jest.fn(async () => {}),
    };
  }
  const emptySnap = (): PageSnapshot => ({
    fields: [],
    hasCaptcha: false,
    requiresEmailOtp: false,
    alreadyAppliedBanner: false,
    validationErrors: [],
    currentStep: 1,
    totalSteps: 1,
    isShadowDom: false,
  });
  const formSnap = (): PageSnapshot => ({
    ...emptySnap(),
    fields: [{ kind: 'input', label: 'Name', required: true, selector: 'a', name: 'n' }],
  });

  it('navigates to the ATS link and returns the destination state when it has fields', async () => {
    const page = fakePage({
      anchors: [{ text: 'Apply', href: 'https://jobs.lever.co/acme/abc' }],
      snap: formSnap(),
    });
    const state = await followApplyLink(page as never);
    expect(page.goto).toHaveBeenCalledWith(
      'https://jobs.lever.co/acme/abc',
      expect.objectContaining({ waitUntil: 'domcontentloaded' }),
    );
    expect(state?.fields).toHaveLength(1);
  });

  it('returns null when the destination has no form fields', async () => {
    const page = fakePage({
      anchors: [{ text: 'Apply', href: 'https://jobs.lever.co/acme/abc' }],
      snap: emptySnap(),
    });
    const state = await followApplyLink(page as never);
    expect(state).toBeNull();
  });
});
