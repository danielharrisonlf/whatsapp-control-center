import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ApiLogDirection, Prisma } from '@prisma/client';
import { RequestContext } from '../../common/request-context';
import { sanitize, sanitizeUrl, truncateJson } from '../../common/sanitize';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';

export interface ApiLogEntry {
  direction: ApiLogDirection;
  method: string;
  url: string;
  statusCode: number | null;
  durationMs: number;
  requestBody?: unknown;
  responseBody?: unknown;
  metaTraceId?: string | null;
  errorCode?: number | null;
  organizationId?: string | null;
}

/**
 * Writes sanitized request logs for the Developer → API Logs page.
 * Writing never blocks or fails the request that produced it.
 */
@Injectable()
export class ApiLogService {
  private readonly logger = new Logger(ApiLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  record(entry: ApiLogEntry) {
    const ctx = RequestContext.get();
    const organizationId = entry.organizationId ?? ctx?.organizationId ?? null;
    // Inbound requests without an organization (login, health) are not useful in the org log.
    if (!organizationId) return;

    const body = (value: unknown) =>
      this.env.API_LOG_BODIES && value !== undefined
        ? (truncateJson(sanitize(value)) as Prisma.InputJsonValue)
        : undefined;

    this.prisma.apiRequestLog
      .create({
        data: {
          organizationId,
          requestId: ctx?.requestId ?? 'background',
          direction: entry.direction,
          method: entry.method.toUpperCase(),
          url: sanitizeUrl(entry.url),
          statusCode: entry.statusCode,
          durationMs: Math.round(entry.durationMs),
          requestBody: body(entry.requestBody),
          responseBody: body(entry.responseBody),
          metaTraceId: entry.metaTraceId ?? null,
          errorCode: entry.errorCode ?? null,
          actorId: ctx?.userId ?? null,
        },
      })
      .catch((error: unknown) => this.logger.warn(`Failed to write API log: ${String(error)}`));
  }
}
