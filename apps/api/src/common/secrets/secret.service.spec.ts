import { describe, expect, it } from 'vitest';
import { AesGcmSecretService, maskSecret } from './secret.service';

const service = new AesGcmSecretService({
  SECRETS_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  SECRETS_ENCRYPTION_KEY_ID: 'k1',
});

describe('AesGcmSecretService', () => {
  it('round-trips and never stores plaintext', async () => {
    const ct = await service.encrypt('EAAJsecret-token', 'ctx:a');
    expect(ct).not.toContain('EAAJsecret-token');
    expect(ct.startsWith('v1.k1.')).toBe(true);
    await expect(service.decrypt(ct, 'ctx:a')).resolves.toBe('EAAJsecret-token');
  });

  it('uses a fresh IV every time', async () => {
    const [a, b] = await Promise.all([service.encrypt('same', 'ctx'), service.encrypt('same', 'ctx')]);
    expect(a).not.toBe(b);
  });

  it('rejects a ciphertext moved to another context (AAD)', async () => {
    const ct = await service.encrypt('token', 'meta_connection:1:access_token');
    await expect(service.decrypt(ct, 'meta_connection:2:access_token')).rejects.toThrow();
  });

  it('rejects tampered ciphertext', async () => {
    const ct = await service.encrypt('token', 'ctx');
    const parts = ct.split('.');
    parts[4] = Buffer.from('tampered').toString('base64url');
    await expect(service.decrypt(parts.join('.'), 'ctx')).rejects.toThrow();
  });

  it('rejects unknown key ids', async () => {
    const ct = (await service.encrypt('token', 'ctx')).replace('v1.k1.', 'v1.k9.');
    await expect(service.decrypt(ct, 'ctx')).rejects.toThrow(/Unknown secret key id/);
  });
});

describe('maskSecret', () => {
  it('shows only a recognizable prefix and suffix', () => {
    expect(maskSecret('EAAJ1234567890abcdef93A')).toBe('EAAJ•••••••93A');
    expect(maskSecret('short')).toBe('••••••');
  });
});
