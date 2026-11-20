import { classifyOutcome } from '../../../src/tracker/outcomeMonitor';

const APPLIED_SENDERS = ['techcorp.io', 'acme.com'];

describe('classifyOutcome — reply classification', () => {
  it.each([
    // feature/12: Classification of company replies
    [
      'polite rejection',
      'Thank you for applying. Unfortunately we will not move forward.',
      'REJECTED',
    ],
    [
      'PT rejection',
      'Agradecemos seu interesse, mas optamos por seguir com outro candidato.',
      'REJECTED',
    ],
    [
      'assessment invite',
      'Please complete the following technical assessment.',
      'ASSESSMENT_INVITED',
    ],
    ['interview invite', 'We would like to invite you to an interview.', 'INTERVIEW'],
    ['PT interview invite', 'Gostaríamos de agendar uma entrevista com você.', 'INTERVIEW'],
  ] as const)('classifies %s → %s', (_label, body, expected) => {
    const outcome = classifyOutcome(
      { from: 'recruiter@techcorp.io', subject: 'Your application', body },
      APPLIED_SENDERS,
    );

    expect(outcome).toBe(expected);
  });

  it('ignores messages from senders with no registered application', () => {
    // feature/12: Ignore messages that do not belong to applied companies
    const outcome = classifyOutcome(
      {
        from: 'spam@random.net',
        subject: 'Offer',
        body: 'We would like to invite you to an interview.',
      },
      APPLIED_SENDERS,
    );

    expect(outcome).toBeNull();
  });

  it('ignores auto-replies with no identifiable outcome', () => {
    const outcome = classifyOutcome(
      {
        from: 'noreply@techcorp.io',
        subject: 'Application received',
        body: 'We received your application and will review it.',
      },
      APPLIED_SENDERS,
    );

    expect(outcome).toBeNull();
  });
});
