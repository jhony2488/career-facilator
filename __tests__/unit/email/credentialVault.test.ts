import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileCredentialVault } from '../../../src/email_application/credentialVault';

describe('FileCredentialVault — AES-256-GCM credential store (docs 10/11)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'career-vault-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips a credential that is never stored in plaintext', async () => {
    const vault = new FileCredentialVault(dir, 'test-secret');
    const payload = JSON.stringify({ host: 'smtp.gmail.com', user: 'a@b.c', pass: 'app-pass' });

    await vault.setCredential('smtp-main', payload);

    expect(await vault.getCredential('smtp-main')).toBe(payload);
    expect(await vault.has('smtp-main')).toBe(true);
    expect(await vault.list()).toEqual(['smtp-main']);
  });

  it('fails to decrypt with a different secret', async () => {
    await new FileCredentialVault(dir, 'key-A').setCredential('smtp-main', 'secret');
    await expect(new FileCredentialVault(dir, 'key-B').getCredential('smtp-main'))
      .rejects.toThrow();
  });

  it('lists refs without exposing any secret material', async () => {
    const vault = new FileCredentialVault(dir, 's');
    await vault.setCredential('smtp-main', 'x');
    await vault.setCredential('evolution-key', 'y');

    const refs = await vault.list();
    expect(refs.sort()).toEqual(['evolution-key', 'smtp-main']);
  });

  it('removes a credential and reports missing refs', async () => {
    const vault = new FileCredentialVault(dir, 's');
    await vault.setCredential('smtp-main', 'x');

    expect(await vault.remove('smtp-main')).toBe(true);
    expect(await vault.remove('smtp-main')).toBe(false);
    expect(await vault.has('smtp-main')).toBe(false);
  });
});
