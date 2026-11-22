import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { CredentialVault } from './emailDispatcher';

/**
 * Cofre de credenciais (doc 10): cada `ref` vira um arquivo `<ref>.cred` cifrado
 * com AES-256-GCM. A chave vem de CAREER_VAULT_SECRET — nunca de config/log.
 * Mesma construção do SessionVault (src/scraper/sessionVault.ts).
 */
export class FileCredentialVault implements CredentialVault {
  private readonly key: Buffer;
  private readonly legacyKeys: Buffer[];

  constructor(
    private readonly vaultDir: string,
    secret?: string,
    /** Segredos antigos p/ leitura+migração — ex.: 'dev-only-insecure-key'. */
    legacySecrets: string[] = [],
  ) {
    const material = secret ?? process.env.CAREER_VAULT_SECRET ?? 'dev-only-insecure-key';
    this.key = createHash('sha256').update(material).digest();
    this.legacyKeys = legacySecrets
      .filter((s) => s !== material)
      .map((s) => createHash('sha256').update(s).digest());
  }

  /** Payload esperado p/ SMTP: {host, port, secure, user, pass} — mas o cofre não valida formato. */
  async setCredential(ref: string, secretJson: string): Promise<void> {
    await fs.mkdir(this.vaultDir, { recursive: true });
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const payload = Buffer.concat([cipher.update(secretJson, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const blob = Buffer.concat([iv, tag, payload]).toString('base64');
    await fs.writeFile(this.filePath(ref), blob, 'utf-8');
  }

  async getCredential(ref: string): Promise<string> {
    const blob = Buffer.from(await fs.readFile(this.filePath(ref), 'utf-8'), 'base64');
    const keys = [this.key, ...this.legacyKeys];
    let lastErr: unknown;
    for (let i = 0; i < keys.length; i++) {
      try {
        const decipher = createDecipheriv('aes-256-gcm', keys[i], blob.subarray(0, 12));
        decipher.setAuthTag(blob.subarray(12, 28));
        const out = Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]).toString(
          'utf8',
        );
        // Migração silenciosa: decryptou c/ chave antiga → regrava c/ a atual.
        if (i > 0) await this.setCredential(ref, out).catch(() => {});
        return out;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  }

  async has(ref: string): Promise<boolean> {
    try {
      await fs.access(this.filePath(ref));
      return true;
    } catch {
      return false;
    }
  }

  /** Lista apenas os refs — nunca os segredos. */
  async list(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.vaultDir);
      return files.filter((f) => f.endsWith('.cred')).map((f) => f.slice(0, -5));
    } catch {
      return [];
    }
  }

  async remove(ref: string): Promise<boolean> {
    try {
      await fs.unlink(this.filePath(ref));
      return true;
    } catch {
      return false;
    }
  }

  private filePath(ref: string): string {
    return join(this.vaultDir, `${ref.replace(/[^a-z0-9_-]/gi, '_')}.cred`);
  }
}
