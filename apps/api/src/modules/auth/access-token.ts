import { createHmac } from 'node:crypto';
import { safeEqual } from '../../common/crypto';

export interface AccessTokenClaims {
  /** User id. */
  sub: string;
  /** Session id: revoking the session invalidates the refresh token; access tokens expire quickly. */
  sid: string;
  exp: number;
}

/** Compact HMAC-SHA256 signed token (`payload.signature`), carried in an HttpOnly cookie. */
export function signAccessToken(claims: AccessTokenClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyAccessToken(token: string, secret: string, now = Date.now()): AccessTokenClaims | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AccessTokenClaims;
    if (typeof claims.sub !== 'string' || typeof claims.sid !== 'string' || typeof claims.exp !== 'number')
      return null;
    if (claims.exp * 1000 <= now) return null;
    return claims;
  } catch {
    return null;
  }
}
