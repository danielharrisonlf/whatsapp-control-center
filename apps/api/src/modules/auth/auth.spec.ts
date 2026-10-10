import { describe, expect, it } from 'vitest';
import { signAccessToken, verifyAccessToken } from './access-token';
import { hashPassword, verifyPassword } from './password';

const secret = 'x'.repeat(40);

describe('access tokens', () => {
  it('verifies a valid token', () => {
    const token = signAccessToken({ sub: 'u', sid: 's', exp: Math.floor(Date.now() / 1000) + 60 }, secret);
    expect(verifyAccessToken(token, secret)).toMatchObject({ sub: 'u', sid: 's' });
  });

  it('rejects expired, forged and tampered tokens', () => {
    const expired = signAccessToken({ sub: 'u', sid: 's', exp: Math.floor(Date.now() / 1000) - 1 }, secret);
    expect(verifyAccessToken(expired, secret)).toBeNull();
    const valid = signAccessToken({ sub: 'u', sid: 's', exp: Math.floor(Date.now() / 1000) + 60 }, secret);
    expect(verifyAccessToken(valid, 'y'.repeat(40))).toBeNull();
    const [, sig] = valid.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'admin', sid: 's', exp: 9e9 })).toString(
      'base64url',
    );
    expect(verifyAccessToken(`${forgedPayload}.${sig}`, secret)).toBeNull();
  });
});

describe('passwords', () => {
  it('hashes with scrypt and verifies', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash.startsWith('scrypt$131072$8$1$')).toBe(true);
    await expect(verifyPassword('correct horse battery', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });
});
