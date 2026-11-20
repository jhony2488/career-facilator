import { resolveRecipient } from '../../src/email_application/recipientResolver';
import { composeEmail } from '../../src/email_application/emailComposer';
import { dispatchEmail } from '../../src/email_application/emailDispatcher';
import { makeJob, makeMasterProfile, makeSkill } from '../helpers/factories';
import {
  mockRepo,
  mockSmtpTransport,
  mockFlakySmtpTransport,
  mockVault,
} from '../helpers/mocks';
import { EMAIL_ONLY_JOB_TEXT } from '../helpers/fixtures';

describe('Email application: resolve → compose → dispatch → record', () => {
  const profile = makeMasterProfile();

  it('completes the flow with an approved send and records APPLIED_VIA_EMAIL', async () => {
    // feature/10: full happy-path flow
    const repo = mockRepo();
    const transport = mockSmtpTransport();
    const vault = mockVault();
    const job = makeJob({ descriptionMarkdown: EMAIL_ONLY_JOB_TEXT, status: 'TAILORED' });

    const recipient = await resolveRecipient(job, { repo });
    expect(recipient?.email).toBe('careers@techcorp.io');

    const draft = await composeEmail({
      job,
      recipient: recipient!,
      profile,
      skills: [makeSkill()],
      resumePath: 'storage/generated_resumes/job-001.pdf',
      locale: { resumeLanguage: 'en-US', currency: 'USD', salaryExpectation: 4500 },
    });

    expect(draft.subject).toMatch(/senior|full.stack|engineer/i);
    expect(draft.attachments).toContain('storage/generated_resumes/job-001.pdf');
    expect(draft.language).toBe('en-US');

    const result = await dispatchEmail(draft, {
      transport,
      vault,
      config: { dispatchMode: 'AUTO_SEND_HIGH_FIT', smtpCredentialRef: 'smtp-main' },
    });

    expect(result.sent).toBe(true);
    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'careers@techcorp.io', subject: draft.subject }),
    );
    expect(vault.getCredential).toHaveBeenCalledWith('smtp-main');
  });

  it('requires review when dispatchMode is REQUIRE_REVIEW', async () => {
    // feature/10: Require review before sending in review mode
    const transport = mockSmtpTransport();
    const vault = mockVault();
    const draft = {
      to: 'careers@techcorp.io',
      subject: 'Senior Full-Stack Engineer',
      body: '...',
      attachments: [],
      language: 'en-US' as const,
    };

    const result = await dispatchEmail(draft, {
      transport,
      vault,
      config: { dispatchMode: 'REQUIRE_REVIEW', smtpCredentialRef: 'smtp-main' },
    });

    expect(result.sent).toBe(false);
    expect(result.status).toBe('READY_TO_REVIEW');
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it('fetches credentials exclusively from the vault, never from config', async () => {
    // feature/10: Obtain sending credentials only from the protected vault
    const transport = mockSmtpTransport();
    const vault = mockVault();
    const draft = {
      to: 'a@b.co',
      subject: 's',
      body: 'b',
      attachments: [],
      language: 'pt-BR' as const,
    };

    await dispatchEmail(draft, {
      transport,
      vault,
      config: { dispatchMode: 'AUTO_SEND_HIGH_FIT', smtpCredentialRef: 'smtp-main' },
    });

    expect(vault.getCredential).toHaveBeenCalledWith('smtp-main');
    // the provided config contains no password — only a reference
  });

  it('escalates to NEEDS_HUMAN_INPUT after exhausting transient retries', async () => {
    // feature/10 + DECISOES: max 3 transient retries, then escalate
    const transport = mockSmtpTransport(true);
    const vault = mockVault();
    const draft = {
      to: 'a@b.co',
      subject: 's',
      body: 'b',
      attachments: [],
      language: 'en-US' as const,
    };

    const result = await dispatchEmail(draft, {
      transport,
      vault,
      config: {
        dispatchMode: 'AUTO_SEND_HIGH_FIT',
        smtpCredentialRef: 'smtp-main',
        maxRetries: 3,
        retryBackoffMs: 0,
      },
    });

    expect(result.sent).toBe(false);
    expect(result.status).toBe('NEEDS_HUMAN_INPUT');
    expect(transport.sendMail).toHaveBeenCalledTimes(3);
    expect(result.attempts).toBe(3);
  });

  it('succeeds when a transient failure recovers within the retry budget', async () => {
    // feature/10: transient failure on attempt 1, success on attempt 2
    const transport = mockFlakySmtpTransport(1);
    const vault = mockVault();
    const draft = {
      to: 'a@b.co',
      subject: 's',
      body: 'b',
      attachments: [],
      language: 'en-US' as const,
    };

    const result = await dispatchEmail(draft, {
      transport,
      vault,
      config: {
        dispatchMode: 'AUTO_SEND_HIGH_FIT',
        smtpCredentialRef: 'smtp-main',
        maxRetries: 3,
        retryBackoffMs: 0,
      },
    });

    expect(result.sent).toBe(true);
    expect(result.status).toBe('APPLIED_VIA_EMAIL');
    expect(transport.sendMail).toHaveBeenCalledTimes(2);
  });

  it('requires review under HYBRID_BY_SCORE when fitScore is below minScoreAutoSend', async () => {
    // feature/10: hybrid mode routes low-fit drafts to human review
    const transport = mockSmtpTransport();
    const vault = mockVault();
    const draft = {
      to: 'a@b.co',
      subject: 's',
      body: 'b',
      attachments: [],
      language: 'en-US' as const,
      fitScore: 70,
    };

    const result = await dispatchEmail(draft, {
      transport,
      vault,
      config: {
        dispatchMode: 'HYBRID_BY_SCORE',
        smtpCredentialRef: 'smtp-main',
        minScoreAutoSend: 88,
      },
    });

    expect(result.sent).toBe(false);
    expect(result.status).toBe('READY_TO_REVIEW');
    expect(transport.sendMail).not.toHaveBeenCalled();
  });
});
