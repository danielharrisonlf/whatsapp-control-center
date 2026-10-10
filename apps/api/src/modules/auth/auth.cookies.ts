import type { CookieOptions, Response } from 'express';
import type { Env } from '../../config/env';

export const ACCESS_COOKIE = 'wacc_at';
export const REFRESH_COOKIE = 'wacc_rt';

function base(env: Env): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production' };
}

/** The refresh cookie is only sent to the auth endpoints, as the browser sees them. */
function refreshPath(env: Env) {
  return `${env.BROWSER_API_BASE_PATH.replace(/\/$/, '')}/auth`;
}

export function setAuthCookies(
  res: Response,
  env: Env,
  tokens: { accessToken: string; refreshToken: string; refreshExpiresAt: Date },
) {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base(env),
    path: '/',
    maxAge: env.AUTH_ACCESS_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base(env),
    path: refreshPath(env),
    expires: tokens.refreshExpiresAt,
  });
}

export function clearAuthCookies(res: Response, env: Env) {
  res.clearCookie(ACCESS_COOKIE, { ...base(env), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base(env), path: refreshPath(env) });
}
