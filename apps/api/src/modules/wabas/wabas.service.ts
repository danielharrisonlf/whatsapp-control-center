import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { iso, isoOrNull } from '../../common/dto';
import { notFound } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MetaCredentialsService } from '../connections/meta-credentials.service';
import { MetaSyncService } from '../connections/meta-sync.service';
import type { SubscribedApp } from '../meta/meta-waba.service';
import { MetaWabaService } from '../meta/meta-waba.service';

const include = {
  connection: { select: { id: true, name: true, kind: true, status: true } },
  _count: { select: { phoneNumbers: true, flows: true } },
} as const;

@Injectable()
export class WabasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: MetaCredentialsService,
    private readonly sync: MetaSyncService,
    private readonly metaWaba: MetaWabaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string) {
    const wabas = await this.prisma.whatsAppBusinessAccount.findMany({
      where: { organizationId },
      include,
      orderBy: { createdAt: 'asc' },
    });
    const counts = await this.templateCounts(organizationId);
    return wabas.map((w) => this.summary(w, counts.get(w.id)));
  }

  async get(organizationId: string, id: string) {
    const waba = await this.prisma.whatsAppBusinessAccount.findFirst({
      where: { id, organizationId },
      include,
    });
    if (!waba) throw notFound('WhatsApp Business Account');
    const counts = await this.templateCounts(organizationId, id);
    const raw = (waba.raw ?? {}) as Record<string, unknown>;
    const apps = Array.isArray(waba.subscribedApps) ? (waba.subscribedApps as SubscribedApp[]) : [];
    return {
      ...this.summary(waba, counts.get(id)),
      messageTemplateNamespace: waba.messageTemplateNamespace,
      ownershipType: typeof raw.ownership_type === 'string' ? raw.ownership_type : null,
      country: typeof raw.country === 'string' ? raw.country : null,
      isEnabledForInsights:
        typeof raw.is_enabled_for_insights === 'boolean' ? raw.is_enabled_for_insights : null,
      healthStatus: raw.health_status ?? null,
      subscribedApps: apps.map((a) => ({
        id: a.whatsapp_business_api_data?.id ?? null,
        name: a.whatsapp_business_api_data?.name ?? null,
        link: a.whatsapp_business_api_data?.link ?? null,
        overrideCallbackUri: a.override_callback_uri ?? null,
      })),
      flowCount: waba._count.flows,
    };
  }

  async updateLabel(organizationId: string, id: string, displayLabel: string | null) {
    const result = await this.prisma.whatsAppBusinessAccount.updateMany({
      where: { id, organizationId },
      data: { displayLabel },
    });
    if (result.count === 0) throw notFound('WhatsApp Business Account');
    return this.get(organizationId, id);
  }

  async resync(organizationId: string, id: string) {
    const { waba } = await this.credentials.forWaba(organizationId, id);
    return this.sync.resyncWaba(waba);
  }

  async subscribe(organizationId: string, id: string) {
    const { waba, credentials } = await this.credentials.forWaba(organizationId, id);
    await this.metaWaba.subscribeApp(waba.metaWabaId, credentials.token);
    await this.sync.upsertWaba(waba.connection, credentials, waba.metaWabaId);
    await this.audit.record({
      organizationId,
      action: 'WABA_SUBSCRIBED',
      resource: 'waba',
      resourceId: id,
      metadata: { metaWabaId: waba.metaWabaId },
    });
    return this.get(organizationId, id);
  }

  async unsubscribe(organizationId: string, id: string) {
    const { waba, credentials } = await this.credentials.forWaba(organizationId, id);
    await this.metaWaba.unsubscribeApp(waba.metaWabaId, credentials.token);
    await this.sync.upsertWaba(waba.connection, credentials, waba.metaWabaId);
    await this.audit.record({
      organizationId,
      action: 'WABA_UNSUBSCRIBED',
      resource: 'waba',
      resourceId: id,
      metadata: { metaWabaId: waba.metaWabaId },
    });
    return this.get(organizationId, id);
  }

  private async templateCounts(organizationId: string, wabaId?: string) {
    const groups = await this.prisma.messageTemplate.groupBy({
      by: ['wabaId', 'status'],
      where: { organizationId, remoteDeletedAt: null, ...(wabaId ? { wabaId } : {}) },
      _count: { _all: true },
    });
    const map = new Map<string, { total: number; approved: number; pending: number; rejected: number }>();
    for (const g of groups) {
      const entry = map.get(g.wabaId) ?? { total: 0, approved: 0, pending: 0, rejected: 0 };
      entry.total += g._count._all;
      if (g.status === 'APPROVED') entry.approved += g._count._all;
      if (g.status === 'PENDING' || g.status === 'IN_APPEAL') entry.pending += g._count._all;
      if (g.status === 'REJECTED') entry.rejected += g._count._all;
      map.set(g.wabaId, entry);
    }
    return map;
  }

  private summary(
    w: Prisma.WhatsAppBusinessAccountGetPayload<{ include: typeof include }>,
    counts?: { total: number; approved: number; pending: number; rejected: number },
  ) {
    return {
      id: w.id,
      metaWabaId: w.metaWabaId,
      name: w.name,
      displayLabel: w.displayLabel,
      connection: w.connection,
      timezoneId: w.timezoneId,
      currency: w.currency,
      accountReviewStatus: w.accountReviewStatus,
      businessVerificationStatus: w.businessVerificationStatus,
      ownerBusinessName: w.ownerBusinessName,
      ownerBusinessId: w.ownerBusinessId,
      appSubscribed: w.appSubscribed,
      phoneNumberCount: w._count.phoneNumbers,
      templateCounts: counts ?? { total: 0, approved: 0, pending: 0, rejected: 0 },
      lastSyncedAt: isoOrNull(w.lastSyncedAt),
      createdAt: iso(w.createdAt),
    };
  }
}
