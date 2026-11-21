import { resolveWhatsappRecipient } from '../../../src/whatsapp_application/whatsappResolver';
import { mockRepo } from '../../helpers/mocks';

describe('resolveWhatsappRecipient — number extraction + cooldown (doc 15)', () => {
  it('extracts the number from a wa.me link', async () => {
    const recipient = await resolveWhatsappRecipient(
      { descriptionMarkdown: 'Candidatura: https://wa.me/5581999887766' },
      { repo: mockRepo() },
    );
    expect(recipient?.number).toBe('5581999887766');
  });

  it('extracts a phone from a WhatsApp context line', async () => {
    const recipient = await resolveWhatsappRecipient(
      { descriptionMarkdown: 'Envie seu CV pelo WhatsApp: +55 81 99887-7665\nOutras info: foo' },
      { repo: mockRepo() },
    );
    expect(recipient?.number).toBe('5581998877665');
  });

  it('returns null when no WhatsApp channel exists', async () => {
    const recipient = await resolveWhatsappRecipient(
      { descriptionMarkdown: 'Apply on our careers page.' },
      { repo: mockRepo() },
    );
    expect(recipient).toBeNull();
  });

  it('skips numbers still inside the cooldown window', async () => {
    const repo = mockRepo();
    repo.hasWhatsappSentTo.mockResolvedValueOnce(true);
    const recipient = await resolveWhatsappRecipient(
      {
        descriptionMarkdown: 'WhatsApp: wa.me/5581111111111\nOu então wa.me/5581999887766',
      },
      { repo },
    );
    expect(recipient?.number).toBe('5581999887766');
  });
});
