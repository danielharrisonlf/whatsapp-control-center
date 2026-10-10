import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { afterCursor, CursorQuerySchema, iso, pageSchema, toPage, zDate } from '../../common/dto';
import { notFound } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { RequireAction } from '../auth/auth.decorators';

const ApiLogSchema = z
  .object({
    id: z.string(),
    requestId: z.string(),
    direction: z.enum(['INBOUND', 'OUTBOUND']),
    method: z.string(),
    url: z.string(),
    statusCode: z.number().nullable(),
    durationMs: z.number(),
    metaTraceId: z.string().nullable(),
    errorCode: z.number().nullable(),
    createdAt: zDate,
  })
  .meta({ id: 'ApiLog' });

const ApiLogDetailSchema = ApiLogSchema.extend({
  requestBody: z.unknown(),
  responseBody: z.unknown(),
  related: z
    .array(ApiLogSchema)
    .describe('Other entries with the same request ID (inbound call and the Meta calls it made).'),
}).meta({ id: 'ApiLogDetail' });

class ApiLogPageDto extends createZodDto(pageSchema(ApiLogSchema, 'ApiLogPage')) {}
class ApiLogDetailDto extends createZodDto(ApiLogDetailSchema) {}
class ApiLogQueryDto extends createZodDto(
  CursorQuerySchema.extend({
    direction: z.enum(['INBOUND', 'OUTBOUND']).optional(),
    status: z.enum(['success', 'error']).optional(),
    search: z.string().max(200).optional(),
  }),
) {}

type Row = Prisma.ApiRequestLogGetPayload<object>;
const toDto = (r: Row) => ({
  id: r.id,
  requestId: r.requestId,
  direction: r.direction,
  method: r.method,
  url: r.url,
  statusCode: r.statusCode,
  durationMs: r.durationMs,
  metaTraceId: r.metaTraceId,
  errorCode: r.errorCode,
  createdAt: iso(r.createdAt),
});

@ApiTags('API logs')
@Controller('organizations/:organizationId/api-logs')
export class ApiLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequireAction('logs.read')
  @ApiOperation({
    operationId: 'listApiLogs',
    summary: 'Requests to this API and calls made to the Graph API (sanitized)',
  })
  @ZodResponse({ type: ApiLogPageDto })
  async list(@Param('organizationId') organizationId: string, @Query() q: ApiLogQueryDto) {
    const where: Prisma.ApiRequestLogWhereInput = {
      organizationId,
      ...(q.direction ? { direction: q.direction } : {}),
      ...(q.status === 'error' ? { OR: [{ statusCode: { gte: 400 } }, { statusCode: null }] } : {}),
      ...(q.status === 'success' ? { statusCode: { lt: 400 } } : {}),
      ...(q.search ? { url: { contains: q.search, mode: 'insensitive' } } : {}),
    };
    const rows = await this.prisma.apiRequestLog.findMany({
      where: { AND: [where, afterCursor('createdAt', q.cursor)] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      select: {
        id: true,
        requestId: true,
        direction: true,
        method: true,
        url: true,
        statusCode: true,
        durationMs: true,
        metaTraceId: true,
        errorCode: true,
        createdAt: true,
        organizationId: true,
        actorId: true,
        requestBody: false,
        responseBody: false,
      },
    });
    return toPage(rows as Row[], q.limit, (r) => r.createdAt, toDto);
  }

  @Get(':logId')
  @RequireAction('logs.read')
  @ApiOperation({ operationId: 'getApiLog' })
  @ZodResponse({ type: ApiLogDetailDto })
  async get(@Param('organizationId') organizationId: string, @Param('logId', ParseUUIDPipe) id: string) {
    const row = await this.prisma.apiRequestLog.findFirst({ where: { id, organizationId } });
    if (!row) throw notFound('Log entry');
    const related = await this.prisma.apiRequestLog.findMany({
      where: {
        organizationId,
        requestId: row.requestId,
        id: { not: row.id },
        NOT: { requestId: 'background' },
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    return {
      ...toDto(row),
      requestBody: row.requestBody,
      responseBody: row.responseBody,
      related: related.map(toDto),
    };
  }
}
