import { Injectable, Logger } from '@nestjs/common';
import type { MetaConnection, Prisma, WhatsAppBusinessAccount } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MetaBusinessService, type MetaWabaNode } from '../meta/meta-business.service';
import { MetaApiError } from '../meta/meta-error';
import { MetaFlowService } from '../meta/meta-flow.service';
import { type MetaPhoneNode, MetaPhoneNumberService } from '../meta/meta-phone-number.service';
import { type MetaTemplateNode, MetaTemplateService } from '../meta/meta-template.service';
import { MetaWabaService } from '../meta/meta-waba.service';
import { type MetaCredentials, MetaCredentialsService } from './meta-credentials.service';

export interface SyncReport {
  wabas: number;
  phoneNumbers: number;
  templates: number;
  flows: number;
  /** Partial failures: the sync continues with other resources. */
  errors: { resource: string; id: string; message: string; code: number | null }[];
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

export function phoneDataFromMeta(node: MetaPhoneNode) {
  return {
    displayPhoneNumber: node.display_phone_number ?? null,
    verifiedName: node.verified_name ?? null,
    status: node.status ?? null,
    codeVerificationStatus: node.code_verification_status ?? null,
    nameStatus: node.name_status ?? null,
    qualityRating: node.quality_rating ?? null,
    platformType: node.platform_type ?? null,
    throughputLevel: node.throughput?.level ?? null,
    messagingLimitTier: node.whatsapp_business_manager_messaging_limit ?? node.messaging_limit_tier ?? null,
    isOfficialBusinessAccount: node.is_official_business_account ?? null,
    lastOnboardedTime: node.last_onboarded_time ? new Date(node.last_onboarded_time) : null,
    raw: json(node),
    lastSyncedAt: new Date(),
  };
}

export function templateDataFromMeta(node: MetaTemplateNode) {
  return {
    metaTemplateId: node.id,
    category: node.category,
    previousCategory: node.previous_category ?? null,
    parameterFormat: node.parameter_format ?? null,
    status: node.status,
    components: json(node.components ?? []),
    qualityScore: node.quality_score?.score ?? null,
    rejectedReason: node.rejected_reason && node.rejected_reason !== 'NONE' ? node.rejected_reason : null,
    subCategory: node.sub_category ?? null,
    lastSyncedAt: new Date(),
    remoteDeletedAt: null,
  };
}

/**
 * Meta → local sync. Meta is the authority for remote state; local-only fields (labels,
 * creator, history) are never overwritten.
 */
@Injectable()
export class MetaSyncService {
  private readonly logger = new Logger(MetaSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: MetaCredentialsService,
    private readonly metaBusiness: MetaBusinessService,
    private readonly metaWaba: MetaWabaService,
    private readonly metaPhones: MetaPhoneNumberService,
    private readonly metaTemplates: MetaTemplateService,
    private readonly metaFlows: MetaFlowService,
  ) {}

  /** Links WABAs to a connection and syncs everything below them. */
  async syncConnection(connection: MetaConnection, wabaIds: string[]): Promise<SyncReport> {
    const creds = await this.credentials.forConnection(connection);
    const report: SyncReport = { wabas: 0, phoneNumbers: 0, templates: 0, flows: 0, errors: [] };

    for (const metaWabaId of [...new Set(wabaIds)]) {
      try {
        const waba = await this.upsertWaba(connection, creds, metaWabaId);
        report.wabas++;
        const sub = await this.syncWabaChildren(waba, creds);
        report.phoneNumbers += sub.phoneNumbers;
        report.templates += sub.templates;
        report.flows += sub.flows;
        report.errors.push(...sub.errors);
      } catch (error) {
        report.errors.push(this.toReportError('waba', metaWabaId, error));
      }
    }
    await this.prisma.metaConnection.update({
      where: { id: connection.id },
      data: { lastSyncedAt: new Date() },
    });
    return report;
  }

  async resyncWaba(waba: WhatsAppBusinessAccount & { connection: MetaConnection }): Promise<SyncReport> {
    const creds = await this.credentials.forConnection(waba.connection);
    const updated = await this.upsertWaba(waba.connection, creds, waba.metaWabaId);
    const sub = await this.syncWabaChildren(updated, creds);
    return { wabas: 1, ...sub };
  }

  async upsertWaba(connection: MetaConnection, creds: MetaCredentials, metaWabaId: string) {
    const node: MetaWabaNode = await this.metaBusiness.getWaba(metaWabaId, creds.token);
    const ownerId = node.owner_business_info?.id ?? null;
    let businessId: string | null = null;
    if (ownerId) {
      const business = await this.prisma.metaBusiness.upsert({
        where: { connectionId_metaBusinessId: { connectionId: connection.id, metaBusinessId: ownerId } },
        create: {
          connectionId: connection.id,
          metaBusinessId: ownerId,
          name: node.owner_business_info?.name ?? null,
          lastSyncedAt: new Date(),
        },
        update: { name: node.owner_business_info?.name ?? undefined, lastSyncedAt: new Date() },
      });
      businessId = business.id;
    }

    let subscribedApps: unknown = null;
    let appSubscribed: boolean | null = null;
    try {
      const apps = await this.metaWaba.listSubscribedApps(metaWabaId, creds.token);
      subscribedApps = apps;
      appSubscribed = apps.some((a) => a.whatsapp_business_api_data?.id === connection.metaAppId);
    } catch (error) {
      this.logger.warn(`Could not read subscribed apps for WABA ${metaWabaId}: ${String(error)}`);
    }

    const data = {
      name: node.name ?? null,
      timezoneId: node.timezone_id ?? null,
      currency: node.currency ?? null,
      messageTemplateNamespace: node.message_template_namespace ?? null,
      accountReviewStatus: node.account_review_status ?? null,
      businessVerificationStatus: node.business_verification_status ?? null,
      ownerBusinessName: node.owner_business_info?.name ?? null,
      ownerBusinessId: ownerId,
      businessId,
      appSubscribed,
      subscribedApps: subscribedApps === null ? undefined : json(subscribedApps),
      raw: json(node),
      lastSyncedAt: new Date(),
    };
    return this.prisma.whatsAppBusinessAccount.upsert({
      where: { organizationId_metaWabaId: { organizationId: connection.organizationId, metaWabaId } },
      create: { organizationId: connection.organizationId, connectionId: connection.id, metaWabaId, ...data },
      // A WABA re-shared through another connection moves to it.
      update: { connectionId: connection.id, ...data },
    });
  }

  private async syncWabaChildren(waba: WhatsAppBusinessAccount, creds: MetaCredentials) {
    const result = { phoneNumbers: 0, templates: 0, flows: 0, errors: [] as SyncReport['errors'] };
    try {
      result.phoneNumbers = await this.syncPhones(waba, creds);
    } catch (error) {
      result.errors.push(this.toReportError('phone_numbers', waba.metaWabaId, error));
    }
    try {
      result.templates = await this.syncTemplates(waba, creds);
    } catch (error) {
      result.errors.push(this.toReportError('message_templates', waba.metaWabaId, error));
    }
    try {
      result.flows = await this.syncFlows(waba, creds);
    } catch (error) {
      result.errors.push(this.toReportError('flows', waba.metaWabaId, error));
    }
    return result;
  }

  async syncPhones(waba: WhatsAppBusinessAccount, creds: MetaCredentials) {
    const { items } = await this.metaPhones.list(waba.metaWabaId, creds.token);
    for (const node of items) {
      const data = phoneDataFromMeta(node);
      await this.prisma.phoneNumber.upsert({
        where: {
          organizationId_metaPhoneNumberId: {
            organizationId: waba.organizationId,
            metaPhoneNumberId: node.id,
          },
        },
        create: { organizationId: waba.organizationId, wabaId: waba.id, metaPhoneNumberId: node.id, ...data },
        update: { wabaId: waba.id, ...data },
      });
    }
    return items.length;
  }

  async syncTemplates(waba: WhatsAppBusinessAccount, creds: MetaCredentials) {
    const { items, truncated } = await this.metaTemplates.listAll(waba.metaWabaId, creds.token);
    const seen = new Set<string>();
    for (const node of items) {
      seen.add(node.id);
      await this.upsertTemplate(waba, node);
    }
    // Templates that disappeared from Meta were deleted outside the app. Keep them as history.
    if (!truncated) {
      await this.prisma.messageTemplate.updateMany({
        where: { wabaId: waba.id, remoteDeletedAt: null, metaTemplateId: { notIn: [...seen] } },
        data: { remoteDeletedAt: new Date(), status: 'DELETED' },
      });
    }
    return items.length;
  }

  upsertTemplate(waba: Pick<WhatsAppBusinessAccount, 'id' | 'organizationId'>, node: MetaTemplateNode) {
    const data = templateDataFromMeta(node);
    return this.prisma.messageTemplate.upsert({
      where: { wabaId_name_language: { wabaId: waba.id, name: node.name, language: node.language } },
      create: {
        organizationId: waba.organizationId,
        wabaId: waba.id,
        name: node.name,
        language: node.language,
        ...data,
      },
      update: data,
    });
  }

  async syncFlows(waba: WhatsAppBusinessAccount, creds: MetaCredentials) {
    const { items } = await this.metaFlows.listAll(waba.metaWabaId, creds.token);
    for (const node of items) {
      const data = {
        name: node.name,
        status: node.status,
        categories: node.categories ?? [],
        validationErrors: json(node.validation_errors ?? []),
        lastSyncedAt: new Date(),
      };
      await this.prisma.whatsAppFlow.upsert({
        where: { wabaId_metaFlowId: { wabaId: waba.id, metaFlowId: node.id } },
        create: { organizationId: waba.organizationId, wabaId: waba.id, metaFlowId: node.id, ...data },
        update: data,
      });
    }
    return items.length;
  }

  private toReportError(resource: string, id: string, error: unknown) {
    if (error instanceof MetaApiError) {
      return {
        resource,
        id,
        message: error.info.userMessage ?? error.info.message,
        code: error.info.metaCode,
      };
    }
    this.logger.error(
      `Sync of ${resource} ${id} failed`,
      error instanceof Error ? error.stack : String(error),
    );
    return { resource, id, message: 'Unexpected error while syncing.', code: null };
  }
}
