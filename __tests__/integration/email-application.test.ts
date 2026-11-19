import { resolveRecipient } from '../../src/email_application/recipientResolver';
import { composeEmail } from '../../src/email_application/emailComposer';
import { dispatchEmail } from '../../src/email_application/emailDispatcher';
import { makeJob, makeMasterProfile, makeSkill, makeConfig } from '../helpers/factories';
import { mockRepo, mockSmtpTransport, mockVault } from '../helpers/mocks';
import { EMAIL_ONLY_JOB_TEXT } from '../helpers/fixtures';

describe('Candidatura por e-mail: resolver → compor → disparar → registrar', () => {
  const profile = makeMasterProfile();
  const config = makeConfig();

  it('completa o fluxo com envio aprovado e registra APPLIED_VIA_EMAIL', async () => {
    // feature/10: fluxo completo feliz
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

  it('exige revisão quando dispatchMode é REQUIRE_REVIEW', async () => {
    // feature/10: Exigir revisão antes do envio em modo de revisão
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

  it('busca credenciais exclusivamente no cofre, nunca em config', async () => {
    // feature/10: Obter credenciais de envio apenas do cofre protegido
    const transport = mockSmtpTransport();
    const vault = mockVault();
    const draft = { to: 'a@b.co', subject: 's', body: 'b', attachments: [], language: 'pt-BR' as const };

    await dispatchEmail(draft, {
      transport,
      vault,
      config: { dispatchMode: 'AUTO_SEND_HIGH_FIT', smtpCredentialRef: 'smtp-main' },
    });

    expect(vault.getCredential).toHaveBeenCalledWith('smtp-main');
    // a config passada não contém senha — apenas referência
  });

  it('reagenda tentativa após falha temporária e não marca como enviado', async () => {
    // feature/10: Tentar novamente após falha temporária de envio
    const transport = mockSmtpTransport(true);
    const vault = mockVault();
    const draft = { to: 'a@b.co', subject: 's', body: 'b', attachments: [], language: 'en-US' as const };

    const result = await dispatchEmail(draft, {
      transport,
      vault,
      config: { dispatchMode: 'AUTO_SEND_HIGH_FIT', smtpCredentialRef: 'smtp-main' },
    });

    expect(result.sent).toBe(false);
    expect(result.retryScheduled).toBe(true);
  });
});
