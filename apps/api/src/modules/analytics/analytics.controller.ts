import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { SuccessDto, success, zDate, zDateNullable } from '../../common/dto';
import { CurrentMembership, type OrgMembership, RequireAction } from '../auth/auth.decorators';
import { MetaErrorSchema } from '../meta/meta.dto';
import { AnalyticsService } from './analytics.service';

const RangeSchema = z.object({
  range: z.enum(['24h', '7d', '30d', 'custom']).default('7d'),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

class DashboardQueryDto extends createZodDto(RangeSchema.extend({ phoneNumberId: z.uuid().optional() })) {}

class DashboardDto extends createZodDto(
  z
    .object({
      range: z.object({ start: zDate, end: zDate, bucket: z.enum(['hour', 'day']) }),
      accounts: z.object({ wabas: z.number(), phoneNumbers: z.number(), activePhoneNumbers: z.number() }),
      templates: z.object({
        total: z.number(),
        approved: z.number(),
        pending: z.number(),
        rejected: z.number(),
        paused: z.number(),
      }),
      messages: z.object({
        sent: z.number(),
        delivered: z.number(),
        read: z.number(),
        failed: z.number(),
        received: z.number(),
      }),
      webhook: z.object({
        status: z.enum(['healthy', 'degraded', 'idle', 'no_events']),
        lastEventAt: zDateNullable,
        lastErrorAt: zDateNullable,
      }),
      phoneQuality: z.array(
        z.object({
          id: z.string(),
          displayPhoneNumber: z.string().nullable(),
          verifiedName: z.string().nullable(),
          qualityRating: z.string().nullable(),
          status: z.string().nullable(),
          messagingLimitTier: z.string().nullable(),
        }),
      ),
      series: z.array(
        z.object({
          bucket: zDate,
          sent: z.number(),
          delivered: z.number(),
          read: z.number(),
          failed: z.number(),
          received: z.number(),
        }),
      ),
      recentEvents: z.array(
        z.object({
          id: z.string(),
          eventType: z.string(),
          processingStatus: z.string(),
          metaPhoneNumberId: z.string().nullable(),
          receivedAt: zDate,
        }),
      ),
    })
    .meta({ id: 'Dashboard' }),
) {}

class MetaAnalyticsQueryDto extends createZodDto(
  RangeSchema.extend({
    wabaId: z.uuid(),
    phoneNumberId: z.uuid().optional(),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
  }),
) {}

const Availability = {
  available: z.boolean(),
  reason: z.string().nullable(),
  error: MetaErrorSchema.nullable(),
};

class MetaAnalyticsDto extends createZodDto(
  z
    .object({
      wabaId: z.string(),
      range: z.object({ start: zDate, end: zDate, bucket: z.enum(['hour', 'day']) }),
      messaging: z.object({
        ...Availability,
        points: z.array(z.object({ start: zDate, sent: z.number(), delivered: z.number() })),
      }),
      pricing: z.object({
        ...Availability,
        currency: z.string().nullable(),
        points: z.array(
          z.object({
            start: zDate,
            volume: z.number(),
            cost: z.number().nullable(),
            pricingCategory: z.string().nullable(),
            pricingType: z.string().nullable(),
          }),
        ),
      }),
    })
    .meta({ id: 'MetaAnalytics' }),
) {}

export class TemplateAnalyticsQueryDto extends createZodDto(
  RangeSchema.extend({
    wabaId: z.uuid(),
    templateIds: z
      .union([z.string(), z.array(z.uuid())])
      .transform((v) => (Array.isArray(v) ? v : v.split(',')))
      .pipe(z.array(z.uuid()).max(10)),
  }),
) {}

class TemplateAnalyticsDto extends createZodDto(
  z
    .object({
      enabled: z.boolean().nullable(),
      ...Availability,
      templates: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          language: z.string(),
          sent: z.number(),
          delivered: z.number(),
          read: z.number(),
          clicked: z.number(),
        }),
      ),
    })
    .meta({ id: 'TemplateAnalytics' }),
) {}

class EnableInsightsDto extends createZodDto(
  z.object({ wabaId: z.uuid() }).meta({ id: 'EnableInsightsInput' }),
) {}

@ApiTags('Analytics')
@Controller('organizations/:organizationId')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({ operationId: 'getDashboard', summary: 'Overview numbers from data observed by this app' })
  @ZodResponse({ type: DashboardDto })
  dashboard(@CurrentMembership() m: OrgMembership, @Query() q: DashboardQueryDto) {
    return this.analytics.dashboard(m.organizationId, q.range, q.from, q.to, q.phoneNumberId);
  }

  @Get('analytics/meta')
  @ApiOperation({
    operationId: 'getMetaAnalytics',
    summary: 'Messaging and pricing analytics reported by Meta (1-year lookback)',
  })
  @ZodResponse({ type: MetaAnalyticsDto })
  meta(@CurrentMembership() m: OrgMembership, @Query() q: MetaAnalyticsQueryDto) {
    return this.analytics.meta(m.organizationId, q);
  }

  @Get('analytics/templates')
  @ApiOperation({
    operationId: 'getTemplateAnalytics',
    summary: 'Sent, delivered, read and clicks for up to 10 templates (90 days)',
  })
  @ZodResponse({ type: TemplateAnalyticsDto })
  templates(@CurrentMembership() m: OrgMembership, @Query() q: TemplateAnalyticsQueryDto) {
    return this.analytics.templates(m.organizationId, q);
  }

  @Post('analytics/templates/enable')
  @HttpCode(200)
  @RequireAction('wabas.subscribe')
  @ApiOperation({
    operationId: 'enableTemplateInsights',
    summary: 'Enable template analytics for a WABA (is_enabled_for_insights)',
  })
  @ZodResponse({ status: 200, type: SuccessDto })
  async enable(@CurrentMembership() m: OrgMembership, @Body() body: EnableInsightsDto) {
    await this.analytics.enableTemplateInsights(m.organizationId, body.wabaId);
    return success;
  }
}
