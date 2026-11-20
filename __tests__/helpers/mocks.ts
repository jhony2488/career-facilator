import type {
  ExtractedProfile,
  FileStore,
  JobTriageResult,
  PdfReader,
  StructurerModel,
} from './contracts';
import { makeExtractedProfile, makeTriageResult } from './factories';
import { SAMPLE_CV_TEXT, SCANNED_PDF_RESULT } from './fixtures';

/**
 * Mocks of external dependencies. src/ modules receive these dependencies
 * via injection — tests never import playwright, nodemailer, or LLM SDKs.
 */

export interface MockTriageModel {
  generate: jest.Mock<Promise<JobTriageResult>, [prompt: string]>;
}

export function mockTriageModel(result: Partial<JobTriageResult> = {}): MockTriageModel {
  return { generate: jest.fn(async (_prompt: string) => makeTriageResult(result)) };
}

export function mockFailingTriageModel(error = new Error('model unavailable')): MockTriageModel {
  return {
    generate: jest.fn(async (_prompt: string) => {
      throw error;
    }),
  };
}

export interface MockTailorModel {
  tailor: jest.Mock<
    Promise<{ resumeMarkdown: string; answers: Record<string, string> }>,
    [prompt: string]
  >;
  calls: { cachedProfileTokens: number }[];
}

export function mockTailorModel(): MockTailorModel {
  const calls: { cachedProfileTokens: number }[] = [];
  return {
    calls,
    tailor: jest.fn(async (_prompt: string) => {
      calls.push({ cachedProfileTokens: calls.length === 0 ? 4000 : 400 });
      return {
        resumeMarkdown: '# Dev Tester\nSenior Full-Stack TypeScript Engineer\n...',
        answers: { challenge: 'I solved a multi-tenant latency issue...' },
      };
    }),
  };
}

/** Serializable state of a page — what the inspector/escalator sees. */
export interface FakePageState {
  url: string;
  fields: Array<{ kind: string; label: string; required: boolean; value?: string }>;
  hasCaptcha: boolean;
  requiresEmailOtp: boolean;
  validationErrors: string[];
  alreadyAppliedBanner: boolean;
  currentStep: number;
  totalSteps: number;
  isShadowDom: boolean;
  submitted: boolean;
}

export function fakePageState(overrides: Partial<FakePageState> = {}): FakePageState {
  return {
    url: 'https://boards.greenhouse.io/techcorp/jobs/123/apply',
    fields: [
      { kind: 'input', label: 'Full Name', required: true },
      { kind: 'input', label: 'Email', required: true },
      { kind: 'file', label: 'Resume/CV', required: true },
    ],
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

export interface MockSmtpTransport {
  sendMail: jest.Mock<Promise<{ messageId: string }>, [message: unknown]>;
}

export function mockSmtpTransport(shouldFail = false): MockSmtpTransport {
  return {
    sendMail: shouldFail
      ? jest.fn(async (_message: unknown) => {
          throw new Error('SMTP connection reset');
        })
      : jest.fn(async (_message: unknown) => ({ messageId: 'msg-001' })),
  };
}

/** SmtpTransport that fails transiently N times before succeeding. */
export function mockFlakySmtpTransport(failures: number): MockSmtpTransport {
  let calls = 0;
  return {
    sendMail: jest.fn(async (_message: unknown) => {
      if (calls++ < failures) throw new Error('SMTP connection reset');
      return { messageId: 'msg-002' };
    }),
  };
}

export interface MockEvolutionTransport {
  sendText: jest.Mock<Promise<{ messageId: string }>, [number: string, text: string]>;
  sendDocument: jest.Mock<
    Promise<{ messageId: string }>,
    [number: string, pdfBase64: string, fileName: string, caption?: string]
  >;
}

export function mockEvolutionTransport(shouldFail = false): MockEvolutionTransport {
  const fail = (): never => {
    throw new Error('Evolution API /message/sendText: HTTP 503');
  };
  return {
    sendText: shouldFail
      ? jest.fn(async (_number: string, _text: string) => fail())
      : jest.fn(async (_number: string, _text: string) => ({ messageId: 'wa-001' })),
    sendDocument: shouldFail
      ? jest.fn(async (_number: string, _b64: string, _name: string) => fail())
      : jest.fn(async (_number: string, _b64: string, _name: string) => ({ messageId: 'wa-002' })),
  };
}

export interface MockVault {
  getCredential: jest.Mock<Promise<string>, [ref: string]>;
  getSessionState: jest.Mock<Promise<object | null>, [platform: string]>;
  saveSessionState: jest.Mock<Promise<void>, [platform: string, state: object]>;
}

export function mockVault(): MockVault {
  return {
    getCredential: jest.fn(async (ref: string) => `secret-for-${ref}`),
    getSessionState: jest.fn(async (_platform: string) => ({
      cookies: [{ name: 'li_at', value: 'x' }],
    })),
    saveSessionState: jest.fn(async (_platform: string, _state: object) => undefined),
  };
}

/** In-memory repository for tests that do not exercise the real SQLite. */
export function mockRepo() {
  const jobs: Array<{ url: string; company: string; status: string; appliedAt?: string }> = [];
  return {
    jobs,
    dedupCheck: jest.fn(async (input: { url: string; company: string }) => ({
      duplicate: jobs.some((j) => j.url === input.url),
      reason: jobs.some((j) => j.url === input.url) ? ('CANONICAL_URL' as const) : undefined,
    })),
    hasRecentApplication: jest.fn(async (company: string, _days: number) =>
      jobs.some((j) => j.company === company && j.status.startsWith('APPLIED')),
    ),
    recordJob: jest.fn(async (job: { url: string; company: string; status: string }) => {
      jobs.push(job);
    }),
    updateStatus: jest.fn(async (url: string, status: string) => {
      const job = jobs.find((j) => j.url === url);
      if (job) job.status = status;
    }),
    hasEmailSentTo: jest.fn(async (_email: string, _cooldownDays: number) => false),
    recordEmailApplication: jest.fn(async (_input: unknown) => undefined),
    countEmailsSentToday: jest.fn(async () => 0),
    hasWhatsappSentTo: jest.fn(async (_number: string, _cooldownDays: number) => false),
    recordWhatsappApplication: jest.fn(async (_input: unknown) => undefined),
  };
}

// ─── Mocks for the intake module (feature/13) ────────────────────────────────

export interface MockStructurerModel extends StructurerModel {
  generate: jest.Mock<Promise<ExtractedProfile>, [prompt: string]>;
}

export function mockStructurerModel(result: Partial<ExtractedProfile> = {}): MockStructurerModel {
  return { generate: jest.fn(async (_prompt: string) => makeExtractedProfile(result)) };
}

export function mockFailingStructurerModel(
  error = new Error('model unavailable'),
): MockStructurerModel {
  return {
    generate: jest.fn(async (_prompt: string) => {
      throw error;
    }),
  };
}

export function mockPdfReader(text = SAMPLE_CV_TEXT, pages = 2): PdfReader {
  return { extract: jest.fn(async () => ({ text, pages })) };
}

/** Scanned PDF: pages exist, but there is no extractable text layer. */
export function mockScannedPdfReader(): PdfReader {
  return { extract: jest.fn(async () => SCANNED_PDF_RESULT) };
}

/** In-memory FileStore — allows testing MasterProfileStore without touching disk. */
export function mockFileStore(
  initialFiles: Record<string, string> = {},
): FileStore & { files: Map<string, string> } {
  const files = new Map<string, string>(Object.entries(initialFiles));
  return {
    files,
    readFile: jest.fn(async (path: string) => files.get(path) ?? null),
    writeFile: jest.fn(async (path: string, content: string) => {
      files.set(path, content);
    }),
    exists: jest.fn(async (path: string) => files.has(path)),
    archiveFile: jest.fn(async (srcPath: string, destDir: string) => {
      const name = srcPath.split(/[\\/]/).pop() ?? 'profile';
      const dest = `${destDir.replace(/[\\/]$/, '')}/${Date.now()}-${name}`;
      const content = files.get(srcPath) ?? '';
      files.set(dest, content);
      return dest;
    }),
  };
}
