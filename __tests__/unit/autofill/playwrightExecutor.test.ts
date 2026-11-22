import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeLiveFill } from '../../../src/autofill/playwrightExecutor';
import type { PageStateLike } from '../../../src/autofill/formExecutor';
import type { FieldMatch } from '../../../src/autofill/deterministicMatcher';

/**
 * Duck-typed Page/Frame/Locator fakes — live.dom is `unknown` by design, so
 * the executor is exercised without importing playwright (project rule).
 */
function fakeEl(overrides: Record<string, jest.Mock | undefined> = {}) {
  return {
    getAttribute: jest.fn(async () => null),
    fill: jest.fn(async () => {}),
    selectOption: jest.fn(async () => []),
    check: jest.fn(async () => {}),
    uncheck: jest.fn(async () => {}),
    setInputFiles: jest.fn(async () => {}),
    dispatchEvent: jest.fn(async (..._a: unknown[]) => {}),
    click: jest.fn(async () => {
      throw new Error('not clickable');
    }),
    innerText: jest.fn(async () => ''),
    ...overrides,
  };
}

function fakeScope(elements: Record<string, ReturnType<typeof fakeEl>> = {}) {
  const fallback = fakeEl();
  const first = () => fallback;
  const filter = (_opts: { hasText?: string | RegExp }) => ({ first });
  return {
    locator: jest.fn((sel: string) => ({
      first: () => elements[sel] ?? fallback,
      filter,
    })),
    getByLabel: jest.fn(() => ({ first, filter })),
    getByRole: jest.fn((_role: string, _opts?: { name?: RegExp }) => ({
      first,
      filter,
    })),
  };
}

type FakeScope = ReturnType<typeof fakeScope>;

function fakeDom(frames: FakeScope[]) {
  const main = frames[0];
  return {
    frames: () => frames,
    locator: main.locator,
    getByLabel: main.getByLabel,
    getByRole: main.getByRole,
    waitForTimeout: jest.fn(async () => {}),
    url: () => 'https://x.job/apply',
  };
}

function livePage(overrides: Partial<PageStateLike>): PageStateLike {
  return {
    url: 'https://x.job/apply',
    fields: [],
    hasCaptcha: false,
    requiresEmailOtp: false,
    validationErrors: [],
    alreadyAppliedBanner: false,
    currentStep: 1,
    totalSteps: 1,
    isShadowDom: false,
    submitted: false,
    ...overrides,
  };
}

function match(label: string, value: string): FieldMatch {
  return { field: { kind: 'input', label, required: true }, value, source: 'PROFILE' };
}

describe('executeLiveFill — frame-aware filling', () => {
  it('fills a field whose selector lives inside an iframe (frameIdx)', async () => {
    const frameEl = fakeEl();
    const dom = fakeDom([fakeScope(), fakeScope({ '[data-cf-idx="0"]': frameEl })]);
    const live = livePage({
      dom,
      fields: [
        {
          kind: 'input',
          label: 'Email',
          required: true,
          selector: '[data-cf-idx="0"]',
          frameIdx: 1,
        },
      ],
    });

    const res = await executeLiveFill(live, {
      matched: [match('Email', 'dev@x.com')],
      submitMode: 'PAUSE_BEFORE_SUBMIT',
    });

    expect(frameEl.fill).toHaveBeenCalledWith('dev@x.com', { timeout: 3000 });
    expect(res.fieldsFilled).toBe(1);
    expect(res.status).toBe('READY_TO_REVIEW');
  });

  it('clicks the submit button even when it lives in another frame', async () => {
    const submitBtn = fakeEl({
      innerText: jest.fn(async () => 'Enviar candidatura'),
      click: jest.fn(async () => {}),
    });
    const frame1 = fakeScope({ 'button[type="submit"], input[type="submit"]': submitBtn });
    const dom = fakeDom([fakeScope(), frame1]);
    const live = livePage({ dom });

    const res = await executeLiveFill(live, { submitMode: 'AUTO_SUBMIT' });

    expect(submitBtn.click).toHaveBeenCalled();
    expect(res.submitted).toBe(true);
    expect(res.status).toBe('APPLIED');
  });
});

describe('executeLiveFill — dropzone upload fallback', () => {
  let dir: string;
  let resumePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cf-dz-'));
    resumePath = join(dir, 'resume.pdf');
    writeFileSync(resumePath, '%PDF-1.4 fake');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('dispatches drop with a DataTransfer File when no file input exists', async () => {
    const dzEl = fakeEl();
    const dtHandle = { evaluate: jest.fn(async () => {}) };
    const scope = {
      ...fakeScope({ '[data-cf-dz="0"]': dzEl }),
      evaluateHandle: jest.fn(async () => dtHandle),
    };
    const dom = { ...fakeDom([scope]), evaluateHandle: scope.evaluateHandle };
    const live = livePage({
      dom,
      dropzones: [{ selector: '[data-cf-dz="0"]', frameIdx: 0 }],
    });

    const res = await executeLiveFill(live, {
      resumePath,
      submitMode: 'PAUSE_BEFORE_SUBMIT',
    });

    expect(res.resumeAttached).toBe(true);
    const dropped = dzEl.dispatchEvent.mock.calls.filter(([type]) => type === 'drop');
    expect(dropped).toHaveLength(1);
    expect(dropped[0][1]).toHaveProperty('dataTransfer', dtHandle);
  });
});
