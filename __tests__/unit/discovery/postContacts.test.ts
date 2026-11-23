import { extractContacts, hasAnyContact, applyLinkOf } from '../../../src/discovery/postContacts';

describe('extractContacts', () => {
  // feature/01: posts divulgam vagas via e-mail, link ou telefone no texto
  it('extracts emails, wa.me links, BR phones and external apply links', () => {
    const text = `
      Vaga: Backend Developer (remoto)
      Envie CV para rh@acme.com ou vagas@acme.com
      Chama no whats wa.me/5581999887766 ou telefone +55 (81) 99888-7766
      Ou candidate-se em https://boards.greenhouse.io/acme/jobs/42 e também https://forms.gle/xyz123.
      Meu perfil: https://www.linkedin.com/in/recruiter — não é canal.
    `;
    const c = extractContacts(text);

    expect(c.emails).toEqual(['rh@acme.com', 'vagas@acme.com']);
    expect(c.phones).toContain('5581999887766');
    expect(c.links).toContain('https://boards.greenhouse.io/acme/jobs/42');
    expect(c.links).toContain('https://forms.gle/xyz123');
    expect(c.links).toContain('https://wa.me/5581999887766');
    expect(c.links).not.toContain('https://www.linkedin.com/in/recruiter');
    expect(hasAnyContact(c)).toBe(true);
  });

  it('returns empty contacts when the post has no channel', () => {
    const c = extractContacts('Vaga de backend, veja meu portfólio em breve.');

    expect(c.emails).toHaveLength(0);
    expect(c.phones).toHaveLength(0);
    expect(c.links).toHaveLength(0);
    expect(hasAnyContact(c)).toBe(false);
  });

  it('tolerates OCR noise — still finds email and phone among artifacts', () => {
    const c = extractContacts('v a g a s ! ! envie cv -> contato@acme.com | whats: 8l 99l2345O789');

    expect(c.emails).toContain('contato@acme.com');
  });

  // Encurtadores ficam em `shortLinks` — o adapter segue o redirect no browser
  it('collects url shorteners into shortLinks (not apply links)', () => {
    const c = extractContacts('Candidate-se: https://lnkd.in/xyzabc ou https://bit.ly/vaga-dev');

    expect(c.shortLinks).toEqual(['https://lnkd.in/xyzabc', 'https://bit.ly/vaga-dev']);
    expect(c.links).toHaveLength(0);
    expect(applyLinkOf(c)).toBeNull();
  });
});

describe('applyLinkOf', () => {
  it('prefers a real apply link over wa.me', () => {
    const c = extractContacts(
      'cv: rh@acme.com | wa.me/5581999887766 | https://boards.greenhouse.io/acme/jobs/1',
    );
    expect(applyLinkOf(c)).toBe('https://boards.greenhouse.io/acme/jobs/1');
  });

  it('falls back to wa.me when it is the only link', () => {
    const c = extractContacts('chama: wa.me/5581999887766');
    expect(applyLinkOf(c)).toBe('https://wa.me/5581999887766');
  });
});
