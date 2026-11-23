import { agentNavigateToForm, type NavAction } from '../../../src/autofill/applyNavigator';
import type { PageSnapshot } from '../../../src/scraper/pageInspector';

const emptySnap = (): PageSnapshot => ({
  fields: [],
  hasCaptcha: false,
  requiresEmailOtp: false,
  requiresLogin: false,
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
const dzSnap = (): PageSnapshot => ({
  ...emptySnap(),
  dropzones: [{ selector: '[data-cf-dz="0"]' }],
});

function fakePage(opts: {
  snap: PageSnapshot;
  url?: string;
  anchors?: { text: string; href: string }[];
}) {
  const frame = { evaluate: jest.fn(async () => opts.snap) };
  return {
    url: jest.fn(() => opts.url ?? 'https://acme.example/job/1'),
    title: jest.fn(async () => 'Job listing'),
    evaluate: jest.fn(async () => ({
      anchors: opts.anchors ?? [],
      hasButton: true,
    })),
    frames: () => [frame],
    frame: frame,
    goto: jest.fn(async () => {}),
    close: jest.fn(async () => {}),
    waitForLoadState: jest.fn(async () => {}),
    waitForNavigation: jest.fn(async () => Promise.reject(new Error('no nav'))),
    context: () => ({ waitForEvent: jest.fn(async () => Promise.reject(new Error('no popup'))) }),
    getByRole: jest.fn(() => ({
      first: () => ({
        count: async () => 0,
        isVisible: async () => false,
        click: async () => {},
      }),
    })),
    locator: jest.fn(() => ({
      filter: () => ({
        first: () => ({
          count: async () => 0,
          isVisible: async () => false,
          click: async () => {},
        }),
      }),
    })),
    mainFrame: () => frame,
  };
}

describe('agentNavigateToForm — LLM-guided navigation fallback', () => {
  it('stops immediately with stop when the model gives up', async () => {
    const page = fakePage({ snap: emptySnap() });
    const decide = jest.fn(async (): Promise<NavAction | null> => ({ action: 'stop' }));
    const state = await agentNavigateToForm(page as never, { decide });
    expect(state).toBeNull();
    expect(decide).toHaveBeenCalledTimes(1);
    expect(page.goto).not.toHaveBeenCalled();
  });

  it('follows a goto action and returns the destination form state', async () => {
    const page = fakePage({ snap: formSnap() });
    const decide = jest
      .fn()
      .mockResolvedValueOnce({ action: 'goto', target: 'https://acme.example/apply' });
    const state = await agentNavigateToForm(page as never, { decide });
    expect(page.goto).toHaveBeenCalledWith(
      'https://acme.example/apply',
      expect.objectContaining({ waitUntil: 'domcontentloaded' }),
    );
    expect(state?.fields).toHaveLength(1);
  });

  it('treats a dropzone-only destination as a reached form', async () => {
    const page = fakePage({ snap: dzSnap() });
    const decide = jest
      .fn()
      .mockResolvedValueOnce({ action: 'goto', target: 'https://acme.example/apply' });
    const state = await agentNavigateToForm(page as never, { decide });
    expect(state?.dropzones).toHaveLength(1);
  });

  it('aborts on repeated url — the action went nowhere', async () => {
    const page = fakePage({ snap: emptySnap() });
    const decide = jest
      .fn()
      .mockResolvedValue({ action: 'goto', target: 'https://acme.example/job/1' }); // mesma url
    const state = await agentNavigateToForm(page as never, { decide });
    expect(state).toBeNull();
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it('respects maxSteps when the model keeps acting without reaching a form', async () => {
    const url = 'https://acme.example/job/1';
    const page = fakePage({ snap: emptySnap() });
    let i = 0;
    page.url.mockImplementation(() => `${url}#${i}`);
    const decide = jest.fn(async (): Promise<NavAction | null> => ({
      action: 'goto',
      target: `https://acme.example/p${++i}`,
    }));
    const state = await agentNavigateToForm(page as never, { decide, maxSteps: 3 });
    expect(state).toBeNull();
    expect(decide).toHaveBeenCalledTimes(3);
  });

  it('never navigates to non-http targets the model invents', async () => {
    const page = fakePage({ snap: emptySnap() });
    const decide = jest
      .fn()
      .mockResolvedValueOnce({ action: 'goto', target: 'javascript:void(0)' });
    const state = await agentNavigateToForm(page as never, { decide });
    expect(state).toBeNull();
    expect(page.goto).not.toHaveBeenCalled();
  });
});
