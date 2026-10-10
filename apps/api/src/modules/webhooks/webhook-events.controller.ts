import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { CursorQuerySchema, pageSchema, zDate, zDateNullable } from '../../common/dto';
import { CurrentMembership, type OrgMembership, RequireAction } from '../auth/auth.decorators';
import { WebhookEventsService } from './webhook-events.service';

const STATUSES = ['PENDING', 'PROCESSED', 'IGNORED', 'FAILED', 'REJECTED'] as const;

const WebhookEventSchema = z
  .object({
    id: z.string(),
    endpoint: z.enum(['platform', 'connection']),
    object: z.string().nullable(),
    field: z.string().nullable(),
    eventType: z.string().nullable(),
    metaWabaId: z.string().nullable(),
    metaPhoneNumberId: z.string().nullable(),
    signatureValid: z.boolean(),
    processingStatus: z.enum(STATUSES),
    responseStatus: z.number(),
    error: z.string().nullable(),
    attempts: z.number(),
    receivedAt: zDate,
    processedAt: zDateNullable,
  })
  .meta({ id: 'WebhookEvent' });

class WebhookEventPageDto extends createZodDto(pageSchema(WebhookEventSchema, 'WebhookEventPage')) {}
class WebhookEventDetailDto extends createZodDto(
  WebhookEventSchema.extend({
    payload: z.unknown(),
    headers: z.record(z.string(), z.unknown()),
    processingLog: z.array(z.object({ at: z.string(), level: z.string(), message: z.string() })),
    relatedMessages: z.array(
      z.object({ messageId: z.string().nullable(), wamid: z.string().nullable(), label: z.string() }),
    ),
  }).meta({ id: 'WebhookEventDetail' }),
) {}
class WebhookEventQueryDto extends createZodDto(
  CursorQuerySchema.extend({
    field: z.string().max(60).optional(),
    eventType: z.string().max(80).optional(),
    metaWabaId: z.string().max(30).optional(),
    metaPhoneNumberId: z.string().max(30).optional(),
    status: z.enum(STATUSES).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  }),
) {}
class WebhookEventFacetsDto extends createZodDto(
  z
    .object({
      fields: z.array(z.object({ value: z.string(), count: z.number() })),
      eventTypes: z.array(z.object({ value: z.string(), count: z.number() })),
    })
    .meta({ id: 'WebhookEventFacets' }),
) {}

class WebhookOverviewDto extends createZodDto(
  z
    .object({
      endpoints: z.array(
        z.object({
          kind: z.enum(['platform', 'connection']),
          connectionId: z.string().nullable(),
          connectionName: z.string().nullable(),
          callbackUrl: z.string(),
          verifyTokenConfigured: z.boolean(),
          appSecretConfigured: z.boolean(),
          verifiedAt: zDateNullable,
        }),
      ),
      wabas: z.array(
        z.object({
          id: z.string(),
          name: z.string().nullable(),
          metaWabaId: z.string(),
          appSubscribed: z.boolean().nullable(),
        }),
      ),
      stats: z.object({
        received24h: z.number(),
        rejected24h: z.number(),
        failed24h: z.number(),
        lastEventAt: zDateNullable,
        lastSuccessAt: zDateNullable,
        lastErrorAt: zDateNullable,
        lastError: z.string().nullable(),
        lastErrorEventId: z.string().nullable(),
        byField: z.array(z.object({ field: z.string(), count: z.number() })),
      }),
    })
    .meta({ id: 'WebhookOverview' }),
) {}

class WebhookDiagnosticsDto extends createZodDto(
  z
    .object({
      checkedAt: zDate,
      checks: z.array(
        z.object({
          key: z.string(),
          label: z.string(),
          status: z.enum(['ok', 'warning', 'error', 'skipped']),
          detail: z.string(),
          hint: z.string().nullable(),
        }),
      ),
    })
    .meta({ id: 'WebhookDiagnostics' }),
) {}

@ApiTags('Webhooks')
@Controller('organizations/:organizationId')
export class WebhookEventsController {
  constructor(private readonly events: WebhookEventsService) {}

  @Get('webhooks/overview')
  @ApiOperation({ operationId: 'getWebhookOverview', summary: 'Endpoints, subscriptions and delivery stats' })
  @ZodResponse({ type: WebhookOverviewDto })
  overview(@CurrentMembership() m: OrgMembership) {
    return this.events.overview(m.organizationId);
  }

  @Post('webhooks/diagnostics')
  @HttpCode(200)
  @RequireAction('logs.read')
  @ApiOperation({ operationId: 'runWebhookDiagnostics' })
  @ZodResponse({ status: 200, type: WebhookDiagnosticsDto })
  diagnostics(@CurrentMembership() m: OrgMembership) {
    return this.events.diagnostics(m.organizationId);
  }

  @Get('webhook-events')
  @RequireAction('logs.read')
  @ApiOperation({ operationId: 'listWebhookEvents' })
  @ZodResponse({ type: WebhookEventPageDto })
  list(@CurrentMembership() m: OrgMembership, @Query() q: WebhookEventQueryDto) {
    return this.events.list(m.organizationId, q);
  }

  @Get('webhook-events/facets')
  @RequireAction('logs.read')
  @ApiOperation({ operationId: 'getWebhookEventFacets' })
  @ZodResponse({ type: WebhookEventFacetsDto })
  facets(@CurrentMembership() m: OrgMembership) {
    return this.events.facets(m.organizationId);
  }

  @Get('webhook-events/:eventId')
  @RequireAction('logs.read')
  @ApiOperation({ operationId: 'getWebhookEvent' })
  @ZodResponse({ type: WebhookEventDetailDto })
  get(@CurrentMembership() m: OrgMembership, @Param('eventId', ParseUUIDPipe) id: string) {
    return this.events.get(m.organizationId, id);
  }

  @Post('webhook-events/:eventId/replay')
  @HttpCode(200)
  @RequireAction('webhooks.replay')
  @ApiOperation({
    operationId: 'replayWebhookEvent',
    summary: 'Re-run the internal handler on the stored payload',
  })
  @ZodResponse({ status: 200, type: WebhookEventDetailDto })
  replay(@CurrentMembership() m: OrgMembership, @Param('eventId', ParseUUIDPipe) id: string) {
    return this.events.replay(m.organizationId, id);
  }
}
