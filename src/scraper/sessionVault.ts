import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

/**
 * Cofre de sessões (doc 10): cookies/storageState persistidos com AES-256-GCM.
 * A chave vem de variável de ambiente — nunca de código ou config em texto claro.
 */
export class SessionVault {
  private readonly key: Buffer;

  constructor(
    private readonly vaultDir: string,
    secret?: string,
  ) {
    const material = secret ?? process.env.CAREER_VAULT_SECRET ?? 'dev-only-insecure-key';
    this.key = createHash('sha256').update(material).digest();
  }

  async saveSessionState(platform: string, state: object): Promise<void> {
    await fs.mkdir(this.vaultDir, { recursive: true });
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const payload = Buffer.concat([cipher.update(JSON.stringify(state), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const blob = Buffer.concat([iv, tag, payload]).toString('base64');
    await fs.writeFile(this.filePath(platform), blob, 'utf-8');
  }

  async getSessionState(platform: string): Promise<object | null> {
    try {
      const blob = Buffer.from(await fs.readFile(this.filePath(platform), 'utf-8'), 'base64');
      const iv = blob.subarray(0, 12);
      const tag = blob.subarray(12, 28);
      const payload = blob.subarray(28);
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8');
      return JSON.parse(plain) as object;
    } catch {
      return null;
    }
  }

  private filePath(platform: string): string {
    return join(this.vaultDir, `${platform.replace(/[^a-z0-9_-]/gi, '_')}.session`);
  }
}

/**
 * Fila com jitter (doc 10): espaçamento variável entre candidaturas para
 * simular comportamento humano — nunca abaixo do mínimo configurado.
 */
export class JitteredQueue {
  constructor(
    private readonly minMinutes = 3,
    private readonly maxMinutes = 8,
  ) {}

  /** Próximo intervalo em ms dentro da faixa [min, max], com variação aleatória. */
  nextDelayMs(random: () => number = Math.random): number {
    const span = this.maxMinutes - this.minMinutes;
    const minutes = this.minMinutes + random() * span;
    return Math.round(minutes * 60_000);
  }
}
