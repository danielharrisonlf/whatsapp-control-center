import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { ApiLogService } from '../../modules/api-logs/api-log.service';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../modules/auth/auth.cookies';
import { RequestContext } from '../request-context';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * - Assigns a request ID (echoed in `X-Request-Id`) and opens the async request context.
 * - CSRF defense for cookie-authenticated requests: state-changing requests that carry our
 *   cookies must come from the web app origin.
 * - Records inbound organization requests for Developer → API Logs.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly allowedOrigins: Set<string>;

  constructor(
    @Inject(ENV) env: Env,
    private readonly apiLogs: ApiLogService,
  ) {
    this.allowedOrigins = new Set([new URL(env.WEB_URL).origin, new URL(env.API_PUBLIC_URL).origin]);
  }

  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', requestId);

    if (!SAFE_METHODS.has(req.method) && this.hasAuthCookie(req) && !this.originAllowed(req)) {
      res.status(HttpStatus.FORBIDDEN).json({
        statusCode: 403,
        error: 'Forbidden',
        code: 'FORBIDDEN',
        message: 'Cross-site request blocked.',
        requestId,
      });
      return;
    }

    const started = performance.now();
    const store = { requestId, ip: req.ip };
    RequestContext.run(store, () => {
      res.on('finish', () => {
        // Reading the logs themselves is not logged (the page polls).
        if (!req.originalUrl.startsWith('/organizations/') || req.originalUrl.includes('/api-logs')) return;
        // `finish` may fire outside the async context; re-enter it with the same store.
        RequestContext.run(store, () =>
          this.apiLogs.record({
            direction: 'INBOUND',
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            durationMs: performance.now() - started,
            requestBody: SAFE_METHODS.has(req.method) ? undefined : req.body,
          }),
        );
      });
      next();
    });
  }

  private hasAuthCookie(req: Request) {
    return Boolean(req.cookies?.[ACCESS_COOKIE] || req.cookies?.[REFRESH_COOKIE]);
  }

  private originAllowed(req: Request) {
    const origin = req.headers.origin ?? (req.headers.referer ? safeOrigin(req.headers.referer) : undefined);
    return origin !== undefined && this.allowedOrigins.has(origin);
  }
}

function safeOrigin(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}
