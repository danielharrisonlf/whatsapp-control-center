import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../auth/auth.decorators';

const CheckSchema = z.object({
  status: z.enum(['ok', 'error']),
  durationMs: z.number(),
  error: z.string().optional(),
});

const HealthSchema = z
  .object({
    status: z.enum(['ok', 'error']),
    checks: z.object({ api: CheckSchema, database: CheckSchema.optional() }),
    uptimeSeconds: z.number(),
  })
  .meta({ id: 'Health' });
class HealthDto extends createZodDto(HealthSchema) {}

/**
 * Liveness and readiness. Meta availability is deliberately not part of either: a Graph API
 * outage must not take this service out of rotation.
 */
@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ operationId: 'getHealth', summary: 'Liveness: the process is up' })
  @ZodResponse({ type: HealthDto })
  live() {
    return {
      status: 'ok' as const,
      checks: { api: { status: 'ok' as const, durationMs: 0 } },
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  @Get('ready')
  @ApiOperation({ operationId: 'getReadiness', summary: 'Readiness: API and PostgreSQL' })
  @ZodResponse({ type: HealthDto })
  async ready(@Res({ passthrough: true }) res: Response) {
    const started = performance.now();
    let database: { status: 'ok' | 'error'; durationMs: number; error?: string };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = { status: 'ok', durationMs: Math.round(performance.now() - started) };
    } catch (error) {
      database = {
        status: 'error',
        durationMs: Math.round(performance.now() - started),
        error: 'PostgreSQL unreachable',
      };
      void error;
    }
    const status = database.status === 'ok' ? ('ok' as const) : ('error' as const);
    if (status === 'error') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status,
      checks: { api: { status: 'ok' as const, durationMs: 0 }, database },
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
