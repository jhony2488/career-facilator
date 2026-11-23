import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { SCHEMA_SQL } from './schema';

export type JobStatus =
  | 'DISCOVERED'
  | 'TRIAGED'
  | 'SKIPPED'
  | 'TAILORED'
  | 'READY_TO_REVIEW'
  | 'APPLIED'
  | 'APPLIED_VIA_EMAIL'
  | 'APPLIED_VIA_WHATSAPP'
  | 'NEEDS_HUMAN_INPUT'
  | 'REJECTED'
  | 'ASSESSMENT_INVITED'
  | 'INTERVIEW'
  | 'DEFERRED'
  | 'DRY_RUN'
  | 'FAILED';

export type DedupReason = 'CANONICAL_URL' | 'CONTENT_HASH' | 'COMPANY_COOLDOWN';

export interface DedupVerdict {
  duplicate: boolean;
  reason?: DedupReason;
}

export interface JobRecord {
  id: string;
  url: string;
  canonicalUrl: string;
  contentHash: string;
  source: string;
  company: string;
  title: string;
  descriptionMarkdown: string;
  scope: string;
  status: JobStatus;
  discoveredAt: string;
  appliedAt?: string | null;
  resumePath?: string | null;
  appliedSkills?: string | null;
}

export interface DedupInput {
  url: string;
  company: string;
  title: string;
  descriptionMarkdown: string;
}

export interface DedupOptions {
  companyCooldownDays?: number;
}

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|ref$|ref_|tracking|source$|mc_)/i;
const APPLIED_STATUSES: JobStatus[] = ['APPLIED', 'APPLIED_VIA_EMAIL', 'APPLIED_VIA_WHATSAPP'];

/** Remove parâmetros de rastreamento e normaliza a URL para comparação exata. */
export function canonicalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const kept = [...url.searchParams.entries()].filter(([k]) => !TRACKING_PARAMS.test(k));
    url.search = kept.length ? `?${new URLSearchParams(kept).toString()}` : '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return rawUrl.split('?')[0].replace(/\/$/, '');
  }
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Hash de conteúdo cross-platform: empresa + título + 300 primeiros caracteres. */
export function contentHashOf(company: string, title: string, descriptionMarkdown: string): string {
  const base = `${normalize(company)}|${normalize(title)}|${normalize(descriptionMarkdown).slice(0, 300)}`;
  return createHash('sha256').update(base).digest('hex');
}

export class JobRepository {
  private db: DatabaseSync;

  constructor(dbPath: string = ':memory:') {
    this.db = new DatabaseSync(dbPath);
    this.db.exec(SCHEMA_SQL);
  }

  close(): void {
    this.db.close();
  }

  /**
   * Deduplicação em 3 níveis (feature/02): URL canônica → hash de conteúdo →
   * cooldown por empresa. Executa antes de qualquer chamada de IA.
   */
  async dedupCheck(input: DedupInput, opts: DedupOptions = {}): Promise<DedupVerdict> {
    const canonical = canonicalizeUrl(input.url);
    const byUrl = this.db.prepare('SELECT id FROM jobs WHERE canonical_url = ?').get(canonical);
    if (byUrl) return { duplicate: true, reason: 'CANONICAL_URL' };

    const hash = contentHashOf(input.company, input.title, input.descriptionMarkdown);
    const byHash = this.db.prepare('SELECT id FROM jobs WHERE content_hash = ?').get(hash);
    if (byHash) return { duplicate: true, reason: 'CONTENT_HASH' };

    const cooldownDays = opts.companyCooldownDays ?? 30;
    if (await this.hasRecentApplication(input.company, cooldownDays)) {
      return { duplicate: true, reason: 'COMPANY_COOLDOWN' };
    }

    return { duplicate: false };
  }

  /** Cooldown conta apenas candidaturas efetivamente enviadas (APPLIED*). */
  async hasRecentApplication(company: string, days: number): Promise<boolean> {
    const row = this.db
      .prepare(
        `SELECT applied_at FROM jobs
         WHERE lower(company) = lower(?) AND status IN ('APPLIED', 'APPLIED_VIA_EMAIL')
         ORDER BY applied_at DESC LIMIT 1`,
      )
      .get(company) as { applied_at: string | null } | undefined;

    if (!row?.applied_at) return false;
    const elapsedMs = Date.now() - new Date(row.applied_at).getTime();
    return elapsedMs < days * 24 * 60 * 60 * 1000;
  }

  async recordJob(
    job: Omit<JobRecord, 'canonicalUrl' | 'contentHash'> &
      Partial<Pick<JobRecord, 'canonicalUrl' | 'contentHash'>>,
  ): Promise<void> {
    const canonicalUrl = job.canonicalUrl ?? canonicalizeUrl(job.url);
    const contentHash = contentHashOf(job.company, job.title, job.descriptionMarkdown);
    const appliedAt = APPLIED_STATUSES.includes(job.status)
      ? (job.appliedAt ?? new Date().toISOString())
      : (job.appliedAt ?? null);

    this.db
      .prepare(
        `INSERT OR IGNORE INTO jobs
         (id, url, canonical_url, content_hash, source, company, title, description_markdown, scope, status, discovered_at, applied_at, resume_path, applied_skills)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        job.id,
        job.url,
        canonicalUrl,
        contentHash,
        job.source,
        job.company,
        job.title,
        job.descriptionMarkdown,
        job.scope,
        job.status,
        job.discoveredAt,
        appliedAt,
        job.resumePath ?? null,
        job.appliedSkills ?? null,
      );
  }

  async updateStatus(url: string, status: JobStatus, resumePath?: string | null): Promise<void> {
    const appliedAt = APPLIED_STATUSES.includes(status) ? new Date().toISOString() : null;
    this.db
      .prepare(
        'UPDATE jobs SET status = ?, applied_at = COALESCE(?, applied_at), resume_path = COALESCE(?, resume_path) WHERE url = ? OR canonical_url = ?',
      )
      .run(status, appliedAt, resumePath ?? null, url, canonicalizeUrl(url));
  }

  async getByUrl(canonicalUrl: string): Promise<JobRecord | undefined> {
    const row = this.db
      .prepare('SELECT * FROM jobs WHERE canonical_url = ? OR url = ?')
      .get(canonicalizeUrl(canonicalUrl), canonicalUrl) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  /** Resolve uma vaga por id, url ou canonical_url — referência aceita pelos comandos manuais. */
  async findJob(ref: string): Promise<JobRecord | undefined> {
    const row = this.db
      .prepare('SELECT * FROM jobs WHERE id = ? OR url = ? OR canonical_url = ?')
      .get(ref, ref, canonicalizeUrl(ref)) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  /**
   * Remove a vaga e seus registros de candidatura — torna a URL reprocessável
   * no próximo run (dedup deixa de bloquear). ai_usage_logs fica intacto.
   */
  async deleteJob(ref: string): Promise<boolean> {
    const job = await this.findJob(ref);
    if (!job) return false;
    this.db.prepare('DELETE FROM applications WHERE job_id = ?').run(job.id);
    this.db.prepare('DELETE FROM jobs WHERE id = ?').run(job.id);
    return true;
  }

  /**
   * Confirma envio manual por canal (doc 15): vira a linha pendente da fila
   * para APPLIED_VIA_*, ativando cooldown por destinatário; sem fila pendente,
   * insere o registro (recipient desconhecido → não conta no cooldown, mas
   * entra no teto diário e no histórico).
   */
  async markChannelSent(jobId: string, channel: 'EMAIL' | 'WHATSAPP'): Promise<void> {
    const status = channel === 'EMAIL' ? 'APPLIED_VIA_EMAIL' : 'APPLIED_VIA_WHATSAPP';
    const pending = this.db
      .prepare(
        `SELECT id FROM applications
         WHERE job_id = ? AND channel = ? AND status = 'NEEDS_HUMAN_INPUT'`,
      )
      .get(jobId, channel) as { id: number } | undefined;

    if (pending) {
      this.db
        .prepare('UPDATE applications SET status = ?, sent_at = ? WHERE id = ?')
        .run(status, new Date().toISOString(), pending.id);
      return;
    }
    this.db
      .prepare(`INSERT INTO applications (job_id, status, channel, sent_at) VALUES (?, ?, ?, ?)`)
      .run(jobId, status, channel, new Date().toISOString());
  }

  async listByStatus(status: JobStatus): Promise<JobRecord[]> {
    const rows = this.db
      .prepare('SELECT * FROM jobs WHERE status = ? ORDER BY discovered_at DESC')
      .all(status) as Record<string, unknown>[];
    return rows.map((r) => this.mapRow(r));
  }

  /** Candidaturas efetivamente enviadas (APPLIED*), mais recentes primeiro. */
  async listApplied(limit = 50): Promise<JobRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM jobs
         WHERE status IN ('APPLIED', 'APPLIED_VIA_EMAIL', 'APPLIED_VIA_WHATSAPP')
         ORDER BY applied_at DESC LIMIT ?`,
      )
      .all(limit) as Record<string, unknown>[];
    return rows.map((r) => this.mapRow(r));
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = this.db
      .prepare('SELECT status, COUNT(*) AS n FROM jobs GROUP BY status')
      .all() as { status: string; n: number }[];
    return Object.fromEntries(rows.map((r) => [r.status, r.n]));
  }

  async hasEmailSentTo(email: string, cooldownDays: number): Promise<boolean> {
    const row = this.db
      .prepare(
        `SELECT sent_at FROM applications
         WHERE lower(recipient) = lower(?) AND status = 'APPLIED_VIA_EMAIL'
         ORDER BY sent_at DESC LIMIT 1`,
      )
      .get(email) as { sent_at: string } | undefined;

    if (!row?.sent_at) return false;
    const elapsedMs = Date.now() - new Date(row.sent_at).getTime();
    return elapsedMs < cooldownDays * 24 * 60 * 60 * 1000;
  }

  async recordEmailApplication(input: {
    jobId: string;
    recipient: string;
    subject: string;
    attachmentPath?: string;
  }): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO applications (job_id, status, channel, recipient, subject, attachment_path, sent_at)
         VALUES (?, 'APPLIED_VIA_EMAIL', 'EMAIL', ?, ?, ?, ?)`,
      )
      .run(
        input.jobId,
        input.recipient,
        input.subject,
        input.attachmentPath ?? null,
        new Date().toISOString(),
      );
  }

  /** E-mails efetivamente enviados hoje — base do teto diário (doc 11 §5). */
  async countEmailsSentToday(): Promise<number> {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM applications
         WHERE channel = 'EMAIL' AND status = 'APPLIED_VIA_EMAIL'
           AND date(sent_at) = date('now')`,
      )
      .get() as { n: number };
    return row.n;
  }

  /** Fila manual de WhatsApp (doc 15): número + mensagem + PDF p/ envio na mão. */
  async listWhatsappQueue(): Promise<
    Array<{
      jobId: string;
      recipient: string;
      subject: string | null;
      attachmentPath: string | null;
    }>
  > {
    const rows = this.db
      .prepare(
        `SELECT job_id, recipient, subject, attachment_path FROM applications
         WHERE channel = 'WHATSAPP' AND status = 'NEEDS_HUMAN_INPUT'
         ORDER BY created_at ASC`,
      )
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      jobId: r.job_id as string,
      recipient: r.recipient as string,
      subject: (r.subject as string | null) ?? null,
      attachmentPath: (r.attachment_path as string | null) ?? null,
    }));
  }

  /** Cooldown anti-duplicidade por número de WhatsApp (doc 15). */
  async hasWhatsappSentTo(number: string, cooldownDays: number): Promise<boolean> {
    const row = this.db
      .prepare(
        `SELECT sent_at FROM applications
         WHERE recipient = ? AND status = 'APPLIED_VIA_WHATSAPP'
         ORDER BY sent_at DESC LIMIT 1`,
      )
      .get(number) as { sent_at: string } | undefined;

    if (!row?.sent_at) return false;
    const elapsedMs = Date.now() - new Date(row.sent_at).getTime();
    return elapsedMs < cooldownDays * 24 * 60 * 60 * 1000;
  }

  /**
   * Registra candidatura via WhatsApp: sent=true após envio pela API;
   * sent=false marca a fila manual (NEEDS_HUMAN_INPUT) com número + mensagem.
   */
  async recordWhatsappApplication(input: {
    jobId: string;
    recipient: string;
    sent: boolean;
    subject?: string; // mensagem renderizada — guardada para a fila manual
    attachmentPath?: string;
  }): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO applications (job_id, status, channel, recipient, subject, attachment_path, sent_at)
         VALUES (?, ?, 'WHATSAPP', ?, ?, ?, ?)`,
      )
      .run(
        input.jobId,
        input.sent ? 'APPLIED_VIA_WHATSAPP' : 'NEEDS_HUMAN_INPUT',
        input.recipient,
        input.subject ?? null,
        input.attachmentPath ?? null,
        input.sent ? new Date().toISOString() : null,
      );
  }

  private mapRow(row: Record<string, unknown>): JobRecord {
    return {
      id: row.id as string,
      url: row.url as string,
      canonicalUrl: row.canonical_url as string,
      contentHash: row.content_hash as string,
      source: row.source as string,
      company: row.company as string,
      title: row.title as string,
      descriptionMarkdown: row.description_markdown as string,
      scope: row.scope as string,
      status: row.status as JobStatus,
      discoveredAt: row.discovered_at as string,
      appliedAt: (row.applied_at as string | null) ?? null,
      resumePath: (row.resume_path as string | null) ?? null,
      appliedSkills: (row.applied_skills as string | null) ?? null,
    };
  }
}
