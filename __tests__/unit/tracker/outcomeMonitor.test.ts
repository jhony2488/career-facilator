import { classifyOutcome } from '../../../src/tracker/outcomeMonitor';

const APPLIED_SENDERS = ['techcorp.io', 'acme.com'];

describe('classifyOutcome — classificação de retornos', () => {
  it.each([
    // feature/12: Classificação de respostas das empresas
    [
      'rejeição educada',
      'Thank you for applying. Unfortunately we will not move forward.',
      'REJECTED',
    ],
    [
      'rejeição PT',
      'Agradecemos seu interesse, mas optamos por seguir com outro candidato.',
      'REJECTED',
    ],
    [
      'convite para teste',
      'Please complete the following technical assessment.',
      'ASSESSMENT_INVITED',
    ],
    ['convite para entrevista', 'We would like to invite you to an interview.', 'INTERVIEW'],
    ['convite entrevista PT', 'Gostaríamos de agendar uma entrevista com você.', 'INTERVIEW'],
  ] as const)('classifica %s → %s', (_label, body, expected) => {
    const outcome = classifyOutcome(
      { from: 'recruiter@techcorp.io', subject: 'Your application', body },
      APPLIED_SENDERS,
    );

    expect(outcome).toBe(expected);
  });

  it('ignora mensagens de remetentes sem candidatura registrada', () => {
    // feature/12: Ignorar mensagens que não pertencem a empresas aplicadas
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

  it('ignora respostas automáticas sem desfecho identificável', () => {
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
