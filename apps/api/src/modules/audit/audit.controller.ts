import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { afterCursor, CursorQuerySchema, iso, pageSchema, toPage, zDate } from '../../common/dto';
import { PrismaService } from '../../prisma/prisma.service';
import { RequireAction } from '../auth/auth.decorators';
import { AUDIT_ACTIONS } from './audit.service';

const AuditLogSchema = z
  .object({
    id: z.string(),
    action: z.string(),
    resource: z.string(),
    resourceId: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()),
    actor: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
    ipAddress: z.string().nullable(),
    createdAt: zDate,
  })
  .meta({ id: 'AuditLog' });

class AuditLogPageDto extends createZodDto(pageSchema(AuditLogSchema, 'AuditLogPage')) {}
class AuditQueryDto extends createZodDto(
  CursorQuerySchema.extend({ action: z.enum(AUDIT_ACTIONS).optional() }),
) {}

@ApiTags('Audit')
@Controller('organizations/:organizationId/audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequireAction('audit.read')
  @ApiOperation({ operationId: 'listAuditLogs', summary: 'Sensitive actions performed in the organization' })
  @ZodResponse({ type: AuditLogPageDto })
  async list(@Param('organizationId') organizationId: string, @Query() query: AuditQueryDto) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        ...(query.action ? { action: query.action } : {}),
        ...afterCursor('createdAt', query.cursor),
      },
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return toPage(
      rows,
      query.limit,
      (r) => r.createdAt,
      (r) => ({
        id: r.id,
        action: r.action,
        resource: r.resource,
        resourceId: r.resourceId,
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
        actor: r.actor,
        ipAddress: r.ipAddress,
        createdAt: iso(r.createdAt),
      }),
    );
  }
}
