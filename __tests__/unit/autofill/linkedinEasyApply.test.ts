import { isLinkedInJobUrl, openEasyApplyModal } from '../../../src/autofill/linkedinEasyApply';

// Page fake mínima: só o que openEasyApplyModal consome.
function fakePage(
  opts: {
    roleVisible?: boolean;
    selectorVisible?: boolean;
  } = {},
) {
  const clicked: string[] = [];
  const locator = (visible: boolean) => ({
    isVisible: async () => visible,
    click: async () => {
      clicked.push('click');
    },
    first() {
      return this;
    },
  });
  return {
    page: {
      getByRole: () => locator(opts.roleVisible === true),
      locator: () => locator(opts.selectorVisible === true),
      waitForSelector: async () => ({}),
      waitForTimeout: async () => undefined,
    },
    clicked,
  };
}

describe('isLinkedInJobUrl', () => {
  it('accepts linkedin job detail and collection pages', () => {
    expect(isLinkedInJobUrl('https://www.linkedin.com/jobs/view/4242424200')).toBe(true);
    expect(isLinkedInJobUrl('https://www.linkedin.com/jobs/collections/x?currentJobId=1')).toBe(
      true,
    );
    expect(isLinkedInJobUrl('https://br.linkedin.com/jobs/view/123456789')).toBe(true);
  });

  it('rejects other pages', () => {
    expect(isLinkedInJobUrl('https://www.linkedin.com/jobs/search')).toBe(false);
    expect(isLinkedInJobUrl('https://br.linkedin.com/jobs/desenvolvedor-vagas')).toBe(false);
    expect(isLinkedInJobUrl('https://greenhouse.io/acme/jobs/1')).toBe(false);
    expect(isLinkedInJobUrl('not-a-url')).toBe(false);
  });
});

describe('openEasyApplyModal', () => {
  // O botão do wizard se esconde atrás do aria-label — role primeiro.
  it('clicks the Easy Apply button when it is visible', async () => {
    const { page, clicked } = fakePage({ roleVisible: true });

    const opened = await openEasyApplyModal(page as never);

    expect(opened).toBe(true);
    expect(clicked).toEqual(['click']);
  });

  it('falls back to known LinkedIn selectors when role lookup fails', async () => {
    const { page, clicked } = fakePage({ roleVisible: false, selectorVisible: true });

    const opened = await openEasyApplyModal(page as never);

    expect(opened).toBe(true);
    expect(clicked).toEqual(['click']);
  });

  it('returns false when the job only has an external apply', async () => {
    const { page } = fakePage({ roleVisible: false, selectorVisible: false });

    expect(await openEasyApplyModal(page as never)).toBe(false);
  });
});
