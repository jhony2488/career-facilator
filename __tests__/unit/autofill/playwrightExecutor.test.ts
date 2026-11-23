import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeLiveFill } from '../../../src/autofill/playwrightExecutor';
import type {
  PageStateLike,
  UnresolvedQuestion,
} from '../../../src/autofill/formExecutor';
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

describe('executeLiveFill — choice fields and live answers', () => {
  const authChoice = () => ({
    kind: 'choice',
    label: 'Are you authorized to work in the EU?',
    required: true,
    selector: '[data-cf-idx="0"]',
    name: 'auth',
    options: [
      { label: 'Yes, I am authorized', selector: '[data-cf-idx="0"]' },
      { label: 'No, I am not', selector: '[data-cf-idx="1"]' },
    ],
  });

  it('checks the option matching the resolved answer (radio group)', async () => {
    // feature/06: select the correct alternative in an exclusive option group
    const yesEl = fakeEl();
    const noEl = fakeEl();
    const dom = fakeDom([
      fakeScope({ '[data-cf-idx="0"]': yesEl, '[data-cf-idx="1"]': noEl }),
    ]);
    const live = livePage({ dom, fields: [authChoice()] });

    const res = await executeLiveFill(live, {
      matched: [match('Are you authorized to work in the EU?', 'yes')],
      submitMode: 'PAUSE_BEFORE_SUBMIT',
      humanPace: false,
    });

    expect(yesEl.check).toHaveBeenCalled();
    expect(noEl.check).not.toHaveBeenCalled();
    expect(res.fieldsFilled).toBe(1);
  });

  it('asks the live resolver once per step for unresolved fields and fills the answer', async () => {
    // feature/06: out-of-scope question answered live by the SMART model
    const el = fakeEl();
    const dom = fakeDom([fakeScope({ '[data-cf-idx="0"]': el })]);
    const live = livePage({
      dom,
      fields: [
        {
          kind: 'input',
          label: 'Why do you want this job?',
          required: false,
          selector: '[data-cf-idx="0"]',
        },
      ],
    });
    const answerQuestions = jest.fn(async (_q: UnresolvedQuestion[]) => ({
      'Why do you want this job?': 'Because TypeScript',
    }));

    const res = await executeLiveFill(live, {
      submitMode: 'PAUSE_BEFORE_SUBMIT',
      humanPace: false,
      answerQuestions,
    });

    expect(answerQuestions).toHaveBeenCalledTimes(1);
    expect(answerQuestions.mock.calls[0][0]).toEqual([
      {
        label: 'Why do you want this job?',
        kind: 'input',
        required: false,
        options: undefined,
      },
    ]);
    expect(el.fill).toHaveBeenCalledWith('Because TypeScript', { timeout: 3000 });
    expect(res.liveAnswers).toEqual({ 'Why do you want this job?': 'Because TypeScript' });
  });

  it('downgrades AUTO_SUBMIT when a required field was answered only by the live resolver', async () => {
    // feature/06/anti-fabrication: live-AI answer on a required field ⇒ pause
    const submitBtn = fakeEl({
      innerText: jest.fn(async () => 'Submit application'),
      click: jest.fn(async () => {}),
    });
    const yesEl = fakeEl();
    const dom = fakeDom([
      fakeScope({
        '[data-cf-idx="0"]': yesEl,
        'button[type="submit"], input[type="submit"]': submitBtn,
      }),
    ]);
    const live = livePage({ dom, fields: [authChoice()] });
    const answerQuestions = jest.fn(async () => ({
      'Are you authorized to work in the EU?': 'Yes, I am authorized',
    }));

    const res = await executeLiveFill(live, {
      submitMode: 'AUTO_SUBMIT',
      humanPace: false,
      answerQuestions,
    });

    expect(res.status).toBe('READY_TO_REVIEW');
    expect(res.submitted).toBe(false);
    expect(submitBtn.click).not.toHaveBeenCalled();
    expect(res.liveAnswers).toEqual({
      'Are you authorized to work in the EU?': 'Yes, I am authorized',
    });
  });

  it('reports unansweredRequired for required fields the resolver left blank', async () => {
    const dom = fakeDom([fakeScope()]);
    const live = livePage({
      dom,
      fields: [
        {
          kind: 'input',
          label: 'Codename XQ-42?',
          required: true,
          selector: '[data-cf-idx="0"]',
        },
      ],
    });
    const answerQuestions = jest.fn(async () => null);

    const res = await executeLiveFill(live, {
      submitMode: 'PAUSE_BEFORE_SUBMIT',
      humanPace: false,
      answerQuestions,
    });

    expect(answerQuestions).toHaveBeenCalledTimes(1);
    expect(res.unansweredRequired).toEqual(['Codename XQ-42?']);
    expect(res.fieldsFilled).toBe(0);
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
