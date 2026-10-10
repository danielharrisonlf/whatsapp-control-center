import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomToken } from '../../common/crypto';
import { afterCursor, iso, isoOrNull, toPage } from '../../common/dto';
import { badRequest, notFound } from '../../common/errors';
import { SecretService } from '../../common/secrets/secret.service';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConnectionsService } from '../connections/connections.service';
import { secretContext } from '../connections/meta-credentials.service';
import { WebhookProcessorService } from './webhook-processor.service';
import { signMetaPayload, verifyMetaSignature } from './webhook-signature';

type EventRow = Prisma.WebhookEventGetPayload<object>;

export interface WebhookEventQuery {
  limit: number;
  cursor?: string;
  field?: string;
  eventType?: string;
  metaWabaId?: string;
  metaPhoneNumberId?: string;
  status?: 'PENDING' | 'PROCESSED' | 'IGNORED' | 'FAILED' | 'REJECTED';
  from?: string;
  to?: string;
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[::1\])/;

@Injectable()
export class WebhookEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly processor: WebhookProcessorService,
    private readonly connections: ConnectionsService,
    private readonly secrets: SecretService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async list(organizationId: string, q: WebhookEventQuery) {
    const where: Prisma.WebhookEventWhereInput = {
      organizationId,
      ...(q.field ? { field: q.field } : {}),
      ...(q.eventType ? { eventType: { startsWith: q.eventType } } : {}),
      ...(q.metaWabaId ? { metaWabaId: q.metaWabaId } : {}),
      ...(q.metaPhoneNumberId ? { metaPhoneNumberId: q.metaPhoneNumberId } : {}),
      ...(q.status ? { processingStatus: q.status } : {}),
      ...(q.from || q.to
        ? {
            receivedAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
    };
    const rows = await this.prisma.webhookEvent.findMany({
      where: { AND: [where, afterCursor('receivedAt', q.cursor)] },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      omit: { payload: true, headers: true, processingLog: true },
    });
    return toPage(
      rows as EventRow[],
      q.limit,
      (r) => r.receivedAt,
      (r) => this.summary(r),
    );
  }

  async facets(organizationId: string) {
    const [fields, types] = await Promise.all([
      this.prisma.webhookEvent.groupBy({ by: ['field'], where: { organizationId }, _count: { _all: true } }),
      this.prisma.webhookEvent.groupBy({
        by: ['eventType'],
        where: { organizationId },
        _count: { _all: true },
      }),
    ]);
    return {
      fields: fields.filter((f) => f.field).map((f) => ({ value: f.field!, count: f._count._all })),
      eventTypes: types
        .filter((t) => t.eventType)
        .map((t) => ({ value: t.eventType!, count: t._count._all })),
    };
  }

  async get(organizationId: string, id: string) {
    const row = await this.prisma.webhookEvent.findFirst({
      where: { id, organizationId },
      include: {
        messages: { select: { id: true, wamid: true, direction: true, type: true, status: true } },
        statusEvents: { select: { id: true, wamid: true, status: true, messageId: true } },
      },
    });
    if (!row) throw notFound('Webhook event');
    return {
      ...this.summary(row),
      payload: row.payload,
      headers: row.headers as Record<string, unknown>,
      processingLog: (Array.isArray(row.processingLog) ? row.processingLog : []) as {
        at: string;
        level: string;
        message: string;
      }[],
      relatedMessages: [
        ...row.messages.map((m) => ({
          messageId: m.id,
          wamid: m.wamid,
          label: `${m.direction.toLowerCase()} ${m.type}, ${m.status}`,
        })),
        ...row.statusEvents.map((s) => ({
          messageId: s.messageId,
          wamid: s.wamid,
          label: `status ${s.status}`,
        })),
      ],
    };
  }

  /** Re-runs our handler on the stored payload. Nothing is requested from Meta. */
  async replay(organizationId: string, id: string) {
    const row = await this.prisma.webhookEvent.findFirst({ where: { id, organizationId } });
    if (!row) throw notFound('Webhook event');
    if (!row.signatureValid)
      throw badRequest('Events with an invalid signature are never processed, so they cannot be replayed.');
    await this.processor.process(id);
    await this.audit.record({
      organizationId,
      action: 'WEBHOOK_EVENT_REPLAYED',
      resource: 'webhook_event',
      resourceId: id,
      metadata: { field: row.field },
    });
    return this.get(organizationId, id);
  }

  async overview(organizationId: string) {
    const since = new Date(Date.now() - 86_400_000);
    const [
      connections,
      wabas,
      received24h,
      rejected24h,
      failed24h,
      lastEvent,
      lastSuccess,
      lastError,
      byField,
    ] = await Promise.all([
      this.connections.list(organizationId),
      this.prisma.whatsAppBusinessAccount.findMany({
        where: { organizationId },
        select: { id: true, name: true, metaWabaId: true, appSubscribed: true, connectionId: true },
      }),
      this.prisma.webhookEvent.count({ where: { organizationId, receivedAt: { gte: since } } }),
      this.prisma.webhookEvent.count({
        where: { organizationId, receivedAt: { gte: since }, processingStatus: 'REJECTED' },
      }),
      this.prisma.webhookEvent.count({
        where: { organizationId, receivedAt: { gte: since }, processingStatus: 'FAILED' },
      }),
      this.prisma.webhookEvent.findFirst({
        where: { organizationId },
        orderBy: { receivedAt: 'desc' },
        select: { receivedAt: true },
      }),
      this.prisma.webhookEvent.findFirst({
        where: { organizationId, processingStatus: 'PROCESSED' },
        orderBy: { receivedAt: 'desc' },
        select: { receivedAt: true },
      }),
      this.prisma.webhookEvent.findFirst({
        where: { organizationId, processingStatus: { in: ['FAILED', 'REJECTED'] } },
        orderBy: { receivedAt: 'desc' },
        select: { receivedAt: true, error: true, id: true },
      }),
      this.prisma.webhookEvent.groupBy({
        by: ['field'],
        where: { organizationId, receivedAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);
    const config = this.connections.config();
    const usesPlatform = connections.some((c) => c.usesPlatformApp);
    const endpoints = [
      ...(usesPlatform || connections.length === 0
        ? [
            {
              kind: 'platform' as const,
              connectionId: null,
              connectionName: null,
              callbackUrl: config.platformWebhook.callbackUrl,
              verifyTokenConfigured: config.platformWebhook.verifyTokenConfigured,
              appSecretConfigured: config.platformWebhook.appSecretConfigured,
              verifiedAt: null,
            },
          ]
        : []),
      ...connections
        .filter((c) => c.webhook)
        .map((c) => ({
          kind: 'connection' as const,
          connectionId: c.id,
          connectionName: c.name,
          callbackUrl: c.webhook!.callbackUrl,
          verifyTokenConfigured: true,
          appSecretConfigured: true,
          verifiedAt: c.webhook!.verifiedAt,
        })),
    ];
    return {
      endpoints,
      wabas: wabas.map((w) => ({
        id: w.id,
        name: w.name,
        metaWabaId: w.metaWabaId,
        appSubscribed: w.appSubscribed,
      })),
      stats: {
        received24h,
        rejected24h,
        failed24h,
        lastEventAt: isoOrNull(lastEvent?.receivedAt),
        lastSuccessAt: isoOrNull(lastSuccess?.receivedAt),
        lastErrorAt: isoOrNull(lastError?.receivedAt),
        lastError: lastError?.error ?? null,
        lastErrorEventId: lastError?.id ?? null,
        byField: byField.map((f) => ({ field: f.field ?? 'unknown', count: f._count._all })),
      },
    };
  }

  /**
   * Webhook health checks. The reachability check calls our own public callback URL the way
   * Meta does, which also proves the verify token round-trip.
   */
  async diagnostics(organizationId: string) {
    const overview = await this.overview(organizationId);
    const checks: {
      key: string;
      label: string;
      status: 'ok' | 'warning' | 'error' | 'skipped';
      detail: string;
      hint: string | null;
    }[] = [];

    for (const endpoint of overview.endpoints) {
      const prefix =
        endpoint.kind === 'platform' ? 'Platform endpoint' : `Endpoint (${endpoint.connectionName})`;
      const verifyToken = await this.verifyTokenFor(endpoint.connectionId);
      const url = new URL(endpoint.callbackUrl);

      if (!verifyToken) {
        checks.push({
          key: `${endpoint.callbackUrl}:reachable`,
          label: `${prefix}: reachable`,
          status: 'skipped',
          detail: 'No verify token configured.',
          hint: 'Set META_WEBHOOK_VERIFY_TOKEN.',
        });
      } else {
        const challenge = randomToken(8);
        url.searchParams.set('hub.mode', 'subscribe');
        url.searchParams.set('hub.verify_token', verifyToken);
        url.searchParams.set('hub.challenge', challenge);
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          const body = await res.text();
          const ok = res.ok && body === challenge;
          checks.push({
            key: `${endpoint.callbackUrl}:reachable`,
            label: `${prefix}: endpoint reachable`,
            status: ok ? (PRIVATE_HOST.test(url.hostname) ? 'warning' : 'ok') : 'error',
            detail: ok
              ? `${endpoint.callbackUrl} answered the challenge`
              : `HTTP ${res.status}: ${body.slice(0, 120)}`,
            hint: PRIVATE_HOST.test(url.hostname)
              ? 'This URL is private. Meta cannot reach it; expose it with a public HTTPS URL (API_PUBLIC_URL) or a tunnel.'
              : null,
          });
        } catch (error) {
          checks.push({
            key: `${endpoint.callbackUrl}:reachable`,
            label: `${prefix}: endpoint reachable`,
            status: 'error',
            detail: `Could not call ${endpoint.callbackUrl}: ${(error as Error).message}`,
            hint: 'Check API_PUBLIC_URL and that the API is reachable at that address.',
          });
        }
      }
      checks.push({
        key: `${endpoint.callbackUrl}:verify-token`,
        label: `${prefix}: verify token`,
        status: endpoint.verifyTokenConfigured ? 'ok' : 'error',
        detail: endpoint.verifyTokenConfigured ? 'Configured' : 'Missing',
        hint: endpoint.verifyTokenConfigured
          ? null
          : 'Set META_WEBHOOK_VERIFY_TOKEN and use the same value in the Meta App dashboard.',
      });
      const secret = await this.appSecretFor(endpoint.connectionId);
      const sample = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
      const selfTest = secret ? verifyMetaSignature(sample, signMetaPayload(sample, secret), secret) : false;
      checks.push({
        key: `${endpoint.callbackUrl}:signature`,
        label: `${prefix}: signature verification`,
        status: !secret ? 'error' : overview.stats.rejected24h > 0 ? 'warning' : selfTest ? 'ok' : 'error',
        detail: !secret
          ? 'App secret not configured: every delivery would be rejected.'
          : overview.stats.rejected24h > 0
            ? `${overview.stats.rejected24h} deliveries rejected in the last 24h`
            : 'HMAC-SHA256 with the app secret',
        hint:
          overview.stats.rejected24h > 0
            ? 'Rejected deliveries usually mean the app secret here differs from the Meta app that sends webhooks.'
            : null,
      });
    }

    for (const waba of overview.wabas) {
      checks.push({
        key: `waba:${waba.metaWabaId}`,
        label: `WABA subscribed: ${waba.name ?? waba.metaWabaId}`,
        status: waba.appSubscribed ? 'ok' : waba.appSubscribed === false ? 'error' : 'warning',
        detail: waba.appSubscribed
          ? 'Subscribed'
          : waba.appSubscribed === false
            ? 'Not subscribed'
            : 'Unknown (sync the WABA)',
        hint: waba.appSubscribed
          ? null
          : 'Open the WABA and click "Subscribe app" so Meta delivers its events.',
      });
    }
    checks.push({
      key: 'last-event',
      label: 'Last event',
      status: overview.stats.lastEventAt ? 'ok' : 'warning',
      detail: overview.stats.lastEventAt ?? 'No events received yet',
      hint: overview.stats.lastEventAt ? null : 'Send a message to one of your numbers to generate an event.',
    });
    checks.push({
      key: 'last-error',
      label: 'Last error',
      status: overview.stats.lastErrorAt ? 'warning' : 'ok',
      detail: overview.stats.lastErrorAt
        ? `${overview.stats.lastError ?? 'Error'} (${overview.stats.lastErrorAt})`
        : 'None',
      hint: null,
    });
    return { checkedAt: iso(new Date()), checks };
  }

  private async verifyTokenFor(connectionId: string | null) {
    if (!connectionId) return this.env.META_WEBHOOK_VERIFY_TOKEN || null;
    const config = await this.prisma.webhookConfig.findUnique({ where: { connectionId } });
    return config
      ? this.secrets.decrypt(config.verifyTokenCiphertext, secretContext.verifyToken(connectionId))
      : null;
  }

  private async appSecretFor(connectionId: string | null) {
    if (!connectionId) return this.env.META_APP_SECRET || null;
    const connection = await this.prisma.metaConnection.findUnique({ where: { id: connectionId } });
    return connection?.appSecretCiphertext
      ? this.secrets.decrypt(connection.appSecretCiphertext, secretContext.appSecret(connectionId))
      : null;
  }

  private summary(r: EventRow) {
    return {
      id: r.id,
      endpoint: r.endpoint === 'platform' ? ('platform' as const) : ('connection' as const),
      object: r.object,
      field: r.field,
      eventType: r.eventType,
      metaWabaId: r.metaWabaId,
      metaPhoneNumberId: r.metaPhoneNumberId,
      signatureValid: r.signatureValid,
      processingStatus: r.processingStatus,
      responseStatus: r.responseStatus,
      error: r.error,
      attempts: r.attempts,
      receivedAt: iso(r.receivedAt),
      processedAt: isoOrNull(r.processedAt),
    };
  }
}
