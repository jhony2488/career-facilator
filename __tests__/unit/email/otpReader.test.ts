import {
  extractOtpCode,
  extractOtpLink,
  fetchOtp,
  imapHostFor,
  parseImapCredential,
  type OtpMailbox,
  type OtpMessage,
} from '../../../src/email_application/otpReader';

describe('imapHostFor', () => {
  it('derives IMAP host from known mailbox domains', () => {
    expect(imapHostFor('dev@gmail.com')).toEqual({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
    });
    expect(imapHostFor('dev@outlook.com')?.host).toBe('outlook.office365.com');
  });

  it('returns null for unknown domains (explicit host required)', () => {
    expect(imapHostFor('dev@empresa.com.br')).toBeNull();
  });
});

describe('parseImapCredential', () => {
  it('accepts imap-main creds and derives host for smtp-main creds', () => {
    const imap = parseImapCredential(
      '{"host":"imap.acme.io","port":993,"secure":true,"user":"a@b.c","pass":"x"}',
    );
    expect(imap).toEqual({
      host: 'imap.acme.io',
      port: 993,
      secure: true,
      user: 'a@b.c',
      pass: 'x',
    });

    const smtp = parseImapCredential('{"user":"dev@gmail.com","pass":"app-pw"}');
    expect(smtp?.host).toBe('imap.gmail.com');
    expect(smtp?.port).toBe(993);
  });

  // cred smtp-* tem o host SMTP no JSON — honorHost=false deriva o IMAP do e-mail
  it('ignores smtp host when honorHost is false (derives imap from email)', () => {
    const cred = parseImapCredential(
      '{"host":"smtp.gmail.com","port":465,"secure":true,"user":"dev@gmail.com","pass":"app-pw"}',
      { honorHost: false },
    );
    expect(cred?.host).toBe('imap.gmail.com');
    expect(cred?.port).toBe(993);
  });

  it('rejects missing pass and underivable hosts', () => {
    expect(parseImapCredential('{"user":"a@b.c"}')).toBeNull();
    expect(parseImapCredential('{"user":"a@empresa.com.br","pass":"x"}')).toBeNull();
  });
});

describe('extractOtpCode', () => {
  // feature/09: EMAIL_OTP — código extraído do corpo do e-mail do portal
  it('prefers the code near verification keywords', () => {
    expect(extractOtpCode('Olá! Seu código de verificação é 482913. Não compartilhe.')).toBe(
      '482913',
    );
    expect(extractOtpCode('Your code: 1234')).toBe('1234');
  });

  it('falls back to a standalone 6-8 digit number', () => {
    expect(extractOtpCode('Use 774821 to continue')).toBe('774821');
  });

  it('returns null when no code exists', () => {
    expect(extractOtpCode('Bem-vindo à plataforma!')).toBeNull();
  });
});

describe('extractOtpLink', () => {
  it('finds verify/confirm/magic links and ignores plain urls', () => {
    const text = 'Acesse https://gupy.io e confirme em https://login.gupy.io/verify?token=abc123.';
    expect(extractOtpLink(text)).toBe('https://login.gupy.io/verify?token=abc123');
  });

  it('returns null without a matching link', () => {
    expect(extractOtpLink('Veja https://gupy.io/vagas')).toBeNull();
  });
});

function fakeMailbox(msgs: OtpMessage[]): OtpMailbox & { calls: number } {
  const box = {
    calls: 0,
    connect: async () => {},
    disconnect: async () => {},
    unreadSince: async () => {
      box.calls++;
      return box.calls >= 2 ? msgs : [];
    },
  };
  return box;
}

describe('fetchOtp', () => {
  const now = new Date();
  const wait = async () => {};

  it('polls until a message with a code arrives', async () => {
    const box = fakeMailbox([
      { from: 'noreply@gupy.io', subject: 'Código', text: 'Seu código é 555123' },
    ]);
    const got = await fetchOtp({ mailbox: box, since: now, senderHint: 'gupy.io', waitMs: wait });

    expect(got?.code).toBe('555123');
    expect(got?.from).toBe('noreply@gupy.io');
    expect(box.calls).toBe(2);
  });

  it('returns a confirmation link when there is no code', async () => {
    const box = fakeMailbox([
      {
        from: 'noreply@gupy.io',
        subject: 'Entrar',
        text: 'Confirme: https://login.gupy.io/magic?token=zzz',
      },
    ]);
    const got = await fetchOtp({ mailbox: box, since: now, waitMs: wait });

    expect(got?.code).toBeUndefined();
    expect(got?.link).toBe('https://login.gupy.io/magic?token=zzz');
  });

  it('times out when nothing arrives', async () => {
    const box = fakeMailbox([]);
    const got = await fetchOtp({ mailbox: box, since: now, timeoutMs: 120, waitMs: wait });

    expect(got).toBeNull();
  });
});
