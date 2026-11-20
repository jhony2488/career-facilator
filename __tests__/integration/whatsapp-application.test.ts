import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveWhatsappRecipient } from '../../src/whatsapp_application/whatsappResolver';
import { composeWhatsapp } from '../../src/whatsapp_application/whatsappComposer';
import { applyViaWhatsapp } from '../../src/whatsapp_application/whatsappAppCore';
import { makeJob, makeMasterProfile, makeSkill, makeConfig } from '../helpers/factories';
import { mockRepo, mockEvolutionTransport } from '../helpers/mocks';

const WA_JOB_TEXT = 'Vaga Dev — envie seu currículo pelo WhatsApp: wa.me/5581999887766';
const LOCALE = { resumeLanguage: 'pt-BR' as const, currency: 'BRL' as const, salaryExpectation: 10000 };

describe('WhatsApp application: resolve → compose → queue/send → record', () => {
  const profile = makeMasterProfile();
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'career-wa-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('queues a ready-to-send message and PDF path under MANUAL_QUEUE mode', async () => {
    // feature/15: manual queue — human sends the prepared message by hand
    const repo = mockRepo();
    const pdfPath = join(dir, 'resume.pdf');
    writeFileSync(pdfPath, '%PDF-fake', 'utf-8');
    const config = makeConfig().whatsapp;

    const result = await applyViaWhatsapp(
      {
        jobId: 'job-wa-1',
        descriptionMarkdown: WA_JOB_TEXT,
        job: { title: 'Dev', company: 'TechCorp' },
        profile,
        skills: [makeSkill()],
        resumePath: pdfPath,
        locale: LOCALE,
      },
      { repo, config },
    );

    expect(result.status).toBe('NEEDS_HUMAN_INPUT');
    expect(result.reason).toBe('WHATSAPP_MANUAL');
    expect(result.message?.number).toBe('5581999887766');
    expect(result.message?.text).toContain('Bom dia');
    expect(result.message?.resumePath).toBe(pdfPath);
    expect(repo.recordWhatsappApplication).toHaveBeenCalledWith(
      expect.objectContaining({ sent: false, recipient: '5581999887766' }),
    );
  });

  it('sends text + PDF document via EVOLUTION_API and records APPLIED_VIA_WHATSAPP', async () => {
    // feature/15: Evolution API mode — sendText then sendDocument
    const repo = mockRepo();
    const transport = mockEvolutionTransport();
    const pdfPath = join(dir, 'resume.pdf');
    writeFileSync(pdfPath, '%PDF-fake', 'utf-8');
    const config = { ...makeConfig().whatsapp, mode: 'EVOLUTION_API' as const };

    const result = await applyViaWhatsapp(
      {
        jobId: 'job-wa-2',
        descriptionMarkdown: WA_JOB_TEXT,
        job: { title: 'Dev', company: 'TechCorp' },
        profile,
        skills: [makeSkill()],
        resumePath: pdfPath,
        locale: LOCALE,
      },
      { repo, transport, config },
    );

    expect(result.status).toBe('APPLIED_VIA_WHATSAPP');
    expect(result.sent).toBe(true);
    expect(transport.sendText).toHaveBeenCalledWith('5581999887766', expect.stringContaining('Bom dia'));
    expect(transport.sendDocument).toHaveBeenCalledWith(
      '5581999887766',
      expect.any(String),
      'resume.pdf',
      'Dev',
    );
    expect(repo.recordWhatsappApplication).toHaveBeenCalledWith(
      expect.objectContaining({ sent: true, recipient: '5581999887766' }),
    );
  });

  it('escalates after exhausting transient retries against the API', async () => {
    // feature/15 + DECISOES: transient API failure retries up to maxRetries, then escalates
    const repo = mockRepo();
    const transport = mockEvolutionTransport(true);
    const config = {
      ...makeConfig().whatsapp,
      mode: 'EVOLUTION_API' as const,
      maxRetries: 3,
      retryBackoffMs: 0,
      attachResume: false,
    };

    const result = await applyViaWhatsapp(
      {
        jobId: 'job-wa-3',
        descriptionMarkdown: WA_JOB_TEXT,
        job: { title: 'Dev', company: 'TechCorp' },
        profile,
        skills: [makeSkill()],
        locale: LOCALE,
      },
      { repo, transport, config },
    );

    expect(result.status).toBe('NEEDS_HUMAN_INPUT');
    expect(transport.sendText).toHaveBeenCalledTimes(3);
  });

  it('blocks resend when the number is inside the cooldown window', async () => {
    // feature/15: per-number cooldown, mirroring the email rule
    const repo = mockRepo();
    repo.hasWhatsappSentTo.mockResolvedValue(true);
    const recipient = await resolveWhatsappRecipient(
      { descriptionMarkdown: WA_JOB_TEXT },
      { repo },
    );
    expect(recipient).toBeNull();
  });

  it('composes without the resume when attachResume is off', async () => {
    const job = makeJob({ descriptionMarkdown: WA_JOB_TEXT });
    const message = await composeWhatsapp({
      job: { title: job.title, company: job.company },
      recipient: { number: '5581999887766' },
      profile,
      skills: [makeSkill()],
      resumePath: 'x.pdf',
      locale: LOCALE,
      attachResume: false,
    });
    expect(message.resumePath).toBeUndefined();
    expect(message.text).toContain('Dev Tester');
  });
});
