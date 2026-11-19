import { resolveRecipient } from '../../../src/email_application/recipientResolver';
import { makeJob } from '../../helpers/factories';
import { mockRepo } from '../../helpers/mocks';
import { EMAIL_ONLY_JOB_TEXT } from '../../helpers/fixtures';

describe('resolveRecipient — resolução do destinatário', () => {
  it('extrai o endereço de recrutamento do texto da vaga', async () => {
    // feature/10: Detectar canal de envio por e-mail na vaga sem formulário
    const repo = mockRepo();
    const job = makeJob({ descriptionMarkdown: 'Apply to jobs@techcorp.io' });

    const recipient = await resolveRecipient(job, { repo });

    expect(recipient?.email).toBe('jobs@techcorp.io');
  });

  it('prioriza e-mail de recrutamento quando há múltiplos contatos', async () => {
    // feature/10: Priorizar endereço de recrutamento quando há múltiplos contatos
    const repo = mockRepo();
    const job = makeJob({ descriptionMarkdown: EMAIL_ONLY_JOB_TEXT });

    const recipient = await resolveRecipient(job, { repo });

    expect(recipient?.email).toBe('careers@techcorp.io');
  });

  it('descarta endereços genéricos sem relação com contratação', async () => {
    // feature/10: endereços genéricos sem relação são descartados
    const repo = mockRepo();
    const job = makeJob({
      descriptionMarkdown: 'Billing: finance@techcorp.io. Press: press@techcorp.io.',
    });

    const recipient = await resolveRecipient(job, { repo });

    expect(recipient).toBeNull();
  });

  it('bloqueia envio duplicado dentro do cooldown para o mesmo destinatário', async () => {
    // feature/10: Bloquear envio duplicado para o mesmo destinatário na janela de cooldown
    const repo = mockRepo();
    repo.hasEmailSentTo.mockResolvedValue(true);
    const job = makeJob({ descriptionMarkdown: 'Apply to jobs@techcorp.io' });

    const recipient = await resolveRecipient(job, { repo });

    expect(recipient).toBeNull();
  });

  it('retorna null quando a vaga não contém nenhum e-mail', async () => {
    const repo = mockRepo();
    const job = makeJob({ descriptionMarkdown: 'Apply via our careers portal.' });

    const recipient = await resolveRecipient(job, { repo });

    expect(recipient).toBeNull();
  });
});
