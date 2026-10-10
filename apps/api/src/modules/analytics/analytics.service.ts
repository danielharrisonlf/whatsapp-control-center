import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { iso, isoOrNull } from '../../common/dto';
import { badRequest } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { MetaCredentialsService } from '../connections/meta-credentials.service';
import { MetaAnalyticsService } from '../meta/meta-analytics.service';
import { MetaApiError } from '../meta/meta-error';
import { MetaWabaService } from '../meta/meta-waba.service';

export type Range = '24h' | '7d' | '30d' | 'custom';

export function resolveRange(range: Range, from?: string, to?: string) {
  const end = range === 'custom' && to ? new Date(to) : new Date();
  const hours = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30, custom: 0 }[range];
  const start =
    range === 'custom'
      ? from
        ? new Date(from)
        : new Date(end.getTime() - 7 * 86_400_000)
      : new Date(end.getTime() - hours * 3_600_000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end)
    throw badRequest('Invalid date range.');
  if (end.getTime() - start.getTime() > 366 * 86_400_000)
    throw badRequest('The range is limited to one year.');
  const bucket: 'hour' | 'day' = end.getTime() - start.getTime() <= 48 * 3_600_000 ? 'hour' : 'day';
  return { start, end, bucket };
}

const DELIVERED = ['delivered', 'read', 'played'];
const READ = ['read', 'played'];

function metaUnavailable(error: unknown) {
  if (error instanceof MetaApiError) {
    return { available: false, reason: error.info.userMessage ?? error.info.message, error: error.info };
  }
  throw error;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: MetaCredentialsService,
    private readonly metaAnalytics: MetaAnalyticsService,
    private readonly metaWaba: MetaWabaService,
  ) {}

  /** Dashboard numbers from local data (messages this app sent/received, cached assets). */
  async dashboard(organizationId: string, range: Range, from?: string, to?: string, phoneNumberId?: string) {
    const { start, end, bucket } = resolveRange(range, from, to);
    const messageWhere: Prisma.MessageWhereInput = {
      organizationId,
      createdAt: { gte: start, lte: end },
      ...(phoneNumberId ? { phoneNumberId } : {}),
    };

    const [
      wabas,
      phones,
      templateGroups,
      outboundGroups,
      inbound,
      series,
      recentEvents,
      lastEvent,
      lastError,
    ] = await Promise.all([
      this.prisma.whatsAppBusinessAccount.count({ where: { organizationId } }),
      this.prisma.phoneNumber.findMany({
        where: { organizationId },
        select: {
          id: true,
          displayPhoneNumber: true,
          verifiedName: true,
          qualityRating: true,
          status: true,
          messagingLimitTier: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.messageTemplate.groupBy({
        by: ['status'],
        where: { organizationId, remoteDeletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.message.groupBy({
        by: ['status'],
        where: { ...messageWhere, direction: 'OUTBOUND' },
        _count: { _all: true },
      }),
      this.prisma.message.count({ where: { ...messageWhere, direction: 'INBOUND' } }),
      this.series(organizationId, start, end, bucket, phoneNumberId),
      this.prisma.webhookEvent.findMany({
        where: { organizationId },
        orderBy: { receivedAt: 'desc' },
        take: 6,
        select: {
          id: true,
          eventType: true,
          field: true,
          processingStatus: true,
          receivedAt: true,
          metaPhoneNumberId: true,
        },
      }),
      this.prisma.webhookEvent.findFirst({
        where: { organizationId },
        orderBy: { receivedAt: 'desc' },
        select: { receivedAt: true },
      }),
      this.prisma.webhookEvent.findFirst({
        where: {
          organizationId,
          processingStatus: { in: ['FAILED', 'REJECTED'] },
          receivedAt: { gte: new Date(Date.now() - 86_400_000) },
        },
        orderBy: { receivedAt: 'desc' },
        select: { receivedAt: true },
      }),
    ]);

    const tCount = (s: string[]) =>
      templateGroups.filter((g) => s.includes(g.status)).reduce((a, g) => a + g._count._all, 0);
    const oCount = (s?: string[]) =>
      outboundGroups.filter((g) => !s || s.includes(g.status)).reduce((a, g) => a + g._count._all, 0);
    const failed = oCount(['failed']);

    let webhookStatus: 'healthy' | 'degraded' | 'idle' | 'no_events' = 'no_events';
    if (lastEvent) {
      webhookStatus = lastError
        ? 'degraded'
        : Date.now() - lastEvent.receivedAt.getTime() > 7 * 86_400_000
          ? 'idle'
          : 'healthy';
    }

    return {
      range: { start: iso(start), end: iso(end), bucket },
      accounts: {
        wabas,
        phoneNumbers: phones.length,
        activePhoneNumbers: phones.filter((p) => p.status === 'CONNECTED').length,
      },
      templates: {
        total: templateGroups.reduce((a, g) => a + g._count._all, 0),
        approved: tCount(['APPROVED']),
        pending: tCount(['PENDING', 'IN_APPEAL']),
        rejected: tCount(['REJECTED']),
        paused: tCount(['PAUSED', 'DISABLED']),
      },
      messages: {
        sent: oCount() - failed,
        delivered: oCount(DELIVERED),
        read: oCount(READ),
        failed,
        received: inbound,
      },
      webhook: {
        status: webhookStatus,
        lastEventAt: isoOrNull(lastEvent?.receivedAt),
        lastErrorAt: isoOrNull(lastError?.receivedAt),
      },
      phoneQuality: phones,
      series,
      recentEvents: recentEvents.map((e) => ({
        id: e.id,
        eventType: e.eventType ?? e.field ?? 'unknown',
        processingStatus: e.processingStatus,
        metaPhoneNumberId: e.metaPhoneNumberId,
        receivedAt: iso(e.receivedAt),
      })),
    };
  }

  private async series(
    organizationId: string,
    start: Date,
    end: Date,
    bucket: 'hour' | 'day',
    phoneNumberId?: string,
  ) {
    const phoneFilter = phoneNumberId
      ? Prisma.sql`AND phone_number_id = ${phoneNumberId}::uuid`
      : Prisma.empty;
    const unit = bucket === 'hour' ? Prisma.sql`'hour'` : Prisma.sql`'day'`;
    const step = bucket === 'hour' ? Prisma.sql`interval '1 hour'` : Prisma.sql`interval '1 day'`;
    const rows = await this.prisma.$queryRaw<
      { bucket: Date; sent: bigint; delivered: bigint; read: bigint; failed: bigint; received: bigint }[]
    >`
      WITH buckets AS (
        SELECT generate_series(date_trunc(${unit}, ${start}::timestamptz), date_trunc(${unit}, ${end}::timestamptz), ${step}) AS bucket
      )
      SELECT b.bucket,
        COUNT(m.id) FILTER (WHERE m.direction = 'OUTBOUND' AND m.status <> 'failed') AS sent,
        COUNT(m.id) FILTER (WHERE m.direction = 'OUTBOUND' AND m.status IN ('delivered','read','played')) AS delivered,
        COUNT(m.id) FILTER (WHERE m.direction = 'OUTBOUND' AND m.status IN ('read','played')) AS read,
        COUNT(m.id) FILTER (WHERE m.direction = 'OUTBOUND' AND m.status = 'failed') AS failed,
        COUNT(m.id) FILTER (WHERE m.direction = 'INBOUND') AS received
      FROM buckets b
      LEFT JOIN messages m
        ON date_trunc(${unit}, m.created_at) = b.bucket
        AND m.organization_id = ${organizationId}::uuid
        AND m.created_at BETWEEN ${start} AND ${end}
        ${phoneFilter}
      GROUP BY b.bucket
      ORDER BY b.bucket`;
    return rows.map((r) => ({
      bucket: iso(new Date(r.bucket)),
      sent: Number(r.sent),
      delivered: Number(r.delivered),
      read: Number(r.read),
      failed: Number(r.failed),
      received: Number(r.received),
    }));
  }

  /** Meta-side analytics for one WABA. Each section reports its own availability. */
  async meta(
    organizationId: string,
    input: {
      wabaId: string;
      range: Range;
      from?: string;
      to?: string;
      phoneNumberId?: string;
      countryCode?: string;
    },
  ) {
    const { start, end, bucket } = resolveRange(input.range, input.from, input.to);
    const { waba, credentials } = await this.credentials.forWaba(organizationId, input.wabaId);
    let displayNumbers: string[] | undefined;
    if (input.phoneNumberId) {
      const phone = await this.prisma.phoneNumber.findFirst({
        where: { id: input.phoneNumberId, organizationId },
      });
      if (phone?.displayPhoneNumber) displayNumbers = [phone.displayPhoneNumber.replace(/\D/g, '')];
    }
    const window = { start: Math.floor(start.getTime() / 1000), end: Math.floor(end.getTime() / 1000) };
    const countryCodes = input.countryCode ? [input.countryCode] : undefined;

    const messaging = await this.metaAnalytics
      .messaging(waba.metaWabaId, credentials.token, {
        ...window,
        granularity: bucket === 'hour' ? 'HALF_HOUR' : 'DAY',
        phoneNumbers: displayNumbers,
        countryCodes,
      })
      .then((points) => ({
        available: true,
        reason: null,
        error: null,
        points: points.map((p) => ({
          start: iso(new Date(p.start * 1000)),
          sent: p.sent ?? 0,
          delivered: p.delivered ?? 0,
        })),
      }))
      .catch((e) => ({ ...metaUnavailable(e), points: [] }));

    const pricing = await this.metaAnalytics
      .pricing(waba.metaWabaId, credentials.token, {
        ...window,
        granularity: bucket === 'hour' ? 'HALF_HOUR' : 'DAILY',
        phoneNumbers: displayNumbers,
        countryCodes,
        dimensions: ['PRICING_CATEGORY', 'PRICING_TYPE'],
      })
      .then((points) => ({
        available: true,
        reason: points.length === 0 ? 'Meta returned no pricing data for this period.' : null,
        error: null,
        currency: waba.currency,
        points: points.map((p) => ({
          start: iso(new Date(p.start * 1000)),
          volume: p.volume ?? 0,
          cost: p.cost ?? null,
          pricingCategory: p.pricing_category ?? null,
          pricingType: p.pricing_type ?? null,
        })),
      }))
      .catch((e) => ({ ...metaUnavailable(e), currency: waba.currency, points: [] }));

    return { wabaId: waba.id, range: { start: iso(start), end: iso(end), bucket }, messaging, pricing };
  }

  async templates(
    organizationId: string,
    input: { wabaId: string; templateIds: string[]; range: Range; from?: string; to?: string },
  ) {
    const { start, end } = resolveRange(input.range, input.from, input.to);
    if (end.getTime() - start.getTime() > 90 * 86_400_000)
      throw badRequest('Template analytics cover at most 90 days.');
    const { waba, credentials } = await this.credentials.forWaba(organizationId, input.wabaId);
    const templates = await this.prisma.messageTemplate.findMany({
      where: {
        organizationId,
        wabaId: waba.id,
        id: { in: input.templateIds },
        metaTemplateId: { not: null },
      },
      select: { id: true, name: true, language: true, metaTemplateId: true },
      take: 10,
    });
    const raw = (waba.raw ?? {}) as { is_enabled_for_insights?: boolean };
    if (templates.length === 0)
      return {
        enabled: raw.is_enabled_for_insights ?? null,
        available: true,
        reason: null,
        error: null,
        templates: [],
      };
    try {
      const points = await this.metaAnalytics.templates(waba.metaWabaId, credentials.token, {
        start: Math.floor(start.getTime() / 1000),
        end: Math.floor(end.getTime() / 1000),
        templateIds: templates.map((t) => t.metaTemplateId!),
      });
      return {
        enabled: true,
        available: true,
        reason: null,
        error: null,
        templates: templates.map((t) => {
          const own = points.filter((p) => p.template_id === t.metaTemplateId);
          const sum = (k: 'sent' | 'delivered' | 'read') => own.reduce((a, p) => a + (p[k] ?? 0), 0);
          const clicks = own.flatMap((p) => p.clicked ?? []).reduce((a, c) => a + c.count, 0);
          return {
            id: t.id,
            name: t.name,
            language: t.language,
            sent: sum('sent'),
            delivered: sum('delivered'),
            read: sum('read'),
            clicked: clicks,
          };
        }),
      };
    } catch (error) {
      return { enabled: raw.is_enabled_for_insights ?? null, ...metaUnavailable(error), templates: [] };
    }
  }

  async enableTemplateInsights(organizationId: string, wabaId: string) {
    const { waba, credentials } = await this.credentials.forWaba(organizationId, wabaId);
    await this.metaWaba.enableInsights(waba.metaWabaId, credentials.token);
    await this.prisma.whatsAppBusinessAccount.update({
      where: { id: waba.id },
      data: { raw: { ...((waba.raw ?? {}) as object), is_enabled_for_insights: true } },
    });
  }
}
