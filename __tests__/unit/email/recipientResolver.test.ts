import { resolveRecipient } from '../../../src/email_application/recipientResolver';
import { makeJob } from '../../helpers/factories';
import { mockRepo } from '../../helpers/mocks';
import { EMAIL_ONLY_JOB_TEXT } from '../../helpers/fixtures';

describe('resolveRecipient — recipient resolution', () => {
  it('extracts the recruitment address from the job text', async () => {
    // feature/10: Detect the e-mail submission channel in a job without a form
    const repo = mockRepo();
    const job = makeJob({ descriptionMarkdown: 'Apply to jobs@techcorp.io' });

    const recipient = await resolveRecipient(job, { repo });

    expect(recipient?.email).toBe('jobs@techcorp.io');
  });

  it('prioritizes the recruitment e-mail when there are multiple contacts', async () => {
    // feature/10: Prioritize the recruitment address when there are multiple contacts
    const repo = mockRepo();
    const job = makeJob({ descriptionMarkdown: EMAIL_ONLY_JOB_TEXT });

    const recipient = await resolveRecipient(job, { repo });

    expect(recipient?.email).toBe('careers@techcorp.io');
  });

  it('discards generic addresses unrelated to hiring', async () => {
    // feature/10: unrelated generic addresses are discarded
    const repo = mockRepo();
    const job = makeJob({
      descriptionMarkdown: 'Billing: finance@techcorp.io. Press: press@techcorp.io.',
    });

    const recipient = await resolveRecipient(job, { repo });

    expect(recipient).toBeNull();
  });

  it('blocks duplicate sending within the cooldown for the same recipient', async () => {
    // feature/10: Block duplicate sending to the same recipient within the cooldown window
    const repo = mockRepo();
    repo.hasEmailSentTo.mockResolvedValue(true);
    const job = makeJob({ descriptionMarkdown: 'Apply to jobs@techcorp.io' });

    const recipient = await resolveRecipient(job, { repo });

    expect(recipient).toBeNull();
  });

  it('returns null when the job contains no e-mail', async () => {
    const repo = mockRepo();
    const job = makeJob({ descriptionMarkdown: 'Apply via our careers portal.' });

    const recipient = await resolveRecipient(job, { repo });

    expect(recipient).toBeNull();
  });
});
