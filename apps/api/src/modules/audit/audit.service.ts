import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { RequestContext } from '../../common/request-context';
import { sanitize } from '../../common/sanitize';
import { PrismaService } from '../../prisma/prisma.service';

export const AUDIT_ACTIONS = [
  'ORGANIZATION_CREATED',
  'ORGANIZATION_UPDATED',
  'MEMBER_INVITED',
  'MEMBER_JOINED',
  'MEMBER_ROLE_CHANGED',
  'MEMBER_REMOVED',
  'INVITATION_REVOKED',
  'META_CONNECTION_CREATED',
  'META_CONNECTION_REMOVED',
  'META_SECRET_UPDATED',
  'WABA_CONNECTED',
  'WABA_SUBSCRIBED',
  'WABA_UNSUBSCRIBED',
  'PHONE_ADDED',
  'PHONE_CODE_REQUESTED',
  'PHONE_CODE_VERIFIED',
  'PHONE_REGISTERED',
  'PHONE_DEREGISTERED',
  'PHONE_PIN_CHANGED',
  'PHONE_COMMERCE_UPDATED',
  'PHONE_ENCRYPTION_UPDATED',
  'PHONE_USERS_BLOCKED',
  'PHONE_USERS_UNBLOCKED',
  'PHONE_QR_CREATED',
  'PHONE_QR_UPDATED',
  'PHONE_QR_DELETED',
  'BUSINESS_PROFILE_UPDATED',
  'TEMPLATE_CREATED',
  'TEMPLATE_EDITED',
  'TEMPLATE_DELETED',
  'FLOW_CREATED',
  'FLOW_UPDATED',
  'FLOW_PUBLISHED',
  'FLOW_DEPRECATED',
  'FLOW_DELETED',
  'MEDIA_UPLOADED',
  'MEDIA_DELETED',
  'WEBHOOK_CHANGED',
  'WEBHOOK_EVENT_REPLAYED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  organizationId: string;
  action: AuditAction;
  resource: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  actorId?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Records a sensitive action. Metadata is sanitized; secrets never reach the audit log. */
  async record(entry: AuditEntry) {
    const ctx = RequestContext.get();
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: entry.organizationId,
          actorId: entry.actorId ?? ctx?.userId ?? null,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId ?? null,
          metadata: sanitize(entry.metadata ?? {}) as Prisma.InputJsonValue,
          ipAddress: ctx?.ip ?? null,
        },
      });
    } catch (error) {
      // Audit failures must be visible in logs but never undo the action that already happened.
      this.logger.error(`Failed to write audit log ${entry.action}: ${String(error)}`);
    }
  }
}
