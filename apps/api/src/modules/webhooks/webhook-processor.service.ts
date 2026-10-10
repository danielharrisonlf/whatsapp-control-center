import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type WebhookEvent } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  type InboundMessage,
  inboundMedia,
  type MessagesValue,
  metaTimestamp,
  type StatusUpdate,
  shouldAdvanceStatus,
  type WebhookPayload,
} from './webhook-payload';

interface LogLine {
  at: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

type Outcome = 'handled' | 'ignored';
const json = (v: unknown) => v as Prisma.InputJsonValue;

/**
 * Concurrent upserts of the same row (Meta retrying a delivery while the first copy is still
 * being processed) can both try to insert; the loser retries and finds the row.
 */
async function upsertWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return fn();
    throw error;
  }
}

/**
 * Applies a stored webhook delivery to local state. Idempotent: Meta retries deliveries for
 * days and the explorer can replay them, so every write is an upsert or a guarded update.
 */
@Injectable()
export class WebhookProcessorService {
  private readonly logger = new Logger(WebhookProcessorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async process(eventId: string) {
    const event = await this.prisma.webhookEvent.findUniqueOrThrow({ where: { id: eventId } });
    const log: LogLine[] = [];
    const write = (level: LogLine['level'], message: string) =>
      log.push({ at: new Date().toISOString(), level, message });

    if (!event.signatureValid) {
      write('error', 'Signature invalid: payload was not processed.');
      return this.finish(event, 'REJECTED', log, 'Invalid signature');
    }
    if (!event.organizationId) {
      write('warn', 'No organization owns this WABA in this app; stored only.');
      return this.finish(event, 'IGNORED', log, null);
    }

    const payload = event.payload as WebhookPayload;
    let handled = 0;
    try {
      if (payload.object !== 'whatsapp_business_account') {
        write('warn', `Unexpected object "${payload.object}".`);
      }
      for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
          const outcome = await this.handleChange(
            event,
            entry.id ?? null,
            change.field ?? '',
            change.value ?? {},
            write,
          );
          if (outcome === 'handled') handled++;
        }
      }
      return this.finish(event, handled > 0 ? 'PROCESSED' : 'IGNORED', log, null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      write('error', `Processing failed: ${message}`);
      this.logger.error(`Webhook ${event.id} failed`, error instanceof Error ? error.stack : message);
      return this.finish(event, 'FAILED', log, message);
    }
  }

  private async finish(
    event: WebhookEvent,
    status: WebhookEvent['processingStatus'],
    log: LogLine[],
    error: string | null,
  ) {
    const previous = Array.isArray(event.processingLog) ? (event.processingLog as unknown as LogLine[]) : [];
    const attempt = event.attempts + 1;
    return this.prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        processingStatus: status,
        processingLog: json([
          ...previous,
          { at: new Date().toISOString(), level: 'info', message: `Attempt ${attempt}` },
          ...log,
        ]),
        error,
        attempts: attempt,
        processedAt: new Date(),
      },
    });
  }

  private async handleChange(
    event: WebhookEvent,
    metaWabaId: string | null,
    field: string,
    value: Record<string, unknown>,
    write: (level: LogLine['level'], message: string) => void,
  ): Promise<Outcome> {
    const organizationId = event.organizationId!;
    switch (field) {
      case 'messages':
        return this.handleMessages(event, value as MessagesValue, write);

      case 'message_template_status_update': {
        const templateId = String(value.message_template_id ?? '');
        const reason = typeof value.reason === 'string' && value.reason !== 'NONE' ? value.reason : null;
        const result = await this.prisma.messageTemplate.updateMany({
          where: { organizationId, metaTemplateId: templateId },
          data: {
            status: String(value.event),
            rejectedReason: value.event === 'REJECTED' ? reason : null,
            ...(value.event === 'DELETED' ? { remoteDeletedAt: new Date() } : {}),
          },
        });
        write(
          'info',
          `Template ${value.message_template_name ?? templateId} → ${value.event}${reason ? ` (${reason})` : ''}; ${result.count} local row(s).`,
        );
        return 'handled';
      }

      case 'message_template_quality_update': {
        const templateId = String(value.message_template_id ?? '');
        const score = String(value.new_quality_score ?? 'UNKNOWN');
        const result = await this.prisma.messageTemplate.updateMany({
          where: { organizationId, metaTemplateId: templateId },
          data: { qualityScore: score },
        });
        write(
          'info',
          `Template ${value.message_template_name ?? templateId} quality ${value.previous_quality_score ?? '?'} → ${score}; ${result.count} row(s).`,
        );
        return 'handled';
      }

      case 'template_category_update': {
        const templateId = String(value.message_template_id ?? '');
        const next = typeof value.new_category === 'string' ? value.new_category : null;
        if (next) {
          await this.prisma.messageTemplate.updateMany({
            where: { organizationId, metaTemplateId: templateId },
            data: {
              category: next,
              previousCategory:
                typeof value.previous_category === 'string' ? value.previous_category : undefined,
            },
          });
        }
        write(
          'info',
          `Template ${value.message_template_name ?? templateId} category → ${next ?? 'unchanged'}.`,
        );
        return 'handled';
      }

      case 'message_template_components_update':
        write(
          'info',
          `Template ${value.message_template_name ?? value.message_template_id} components changed. Sync templates to load them.`,
        );
        return 'handled';

      case 'phone_number_quality_update': {
        const display = String(value.display_phone_number ?? '');
        const limit = typeof value.current_limit === 'string' ? value.current_limit : null;
        const phones = await this.findPhonesByDisplay(organizationId, metaWabaId, display);
        if (limit && phones.length) {
          await this.prisma.phoneNumber.updateMany({
            where: { id: { in: phones } },
            data: { messagingLimitTier: limit },
          });
        }
        write(
          'info',
          `Phone ${display}: ${value.event ?? 'quality update'}${limit ? `, limit ${limit}` : ''}.`,
        );
        return 'handled';
      }

      case 'phone_number_name_update': {
        const display = String(value.display_phone_number ?? '');
        const decision = String(value.decision ?? '');
        const phones = await this.findPhonesByDisplay(organizationId, metaWabaId, display);
        if (phones.length) {
          await this.prisma.phoneNumber.updateMany({
            where: { id: { in: phones } },
            data: {
              nameStatus: decision || undefined,
              ...(decision === 'APPROVED' && typeof value.requested_verified_name === 'string'
                ? { verifiedName: value.requested_verified_name }
                : {}),
            },
          });
        }
        write(
          'info',
          `Display name for ${display}: ${decision} ${value.rejection_reason ? `(${value.rejection_reason})` : ''}`.trim(),
        );
        return 'handled';
      }

      case 'account_review_update': {
        if (metaWabaId && typeof value.decision === 'string') {
          await this.prisma.whatsAppBusinessAccount.updateMany({
            where: { organizationId, metaWabaId },
            data: { accountReviewStatus: value.decision },
          });
        }
        write('info', `Account review: ${value.decision}.`);
        return 'handled';
      }

      case 'account_update':
      case 'account_alerts':
      case 'business_capability_update':
      case 'security':
        write(
          'info',
          `${field}: ${String(value.event ?? value.alert_type ?? 'received')}. Stored for reference.`,
        );
        return 'handled';

      case 'flows': {
        const flowId = String(value.flow_id ?? '');
        if (value.event === 'FLOW_STATUS_CHANGE' && typeof value.new_status === 'string') {
          await this.prisma.whatsAppFlow.updateMany({
            where: { organizationId, metaFlowId: flowId },
            data: { status: value.new_status },
          });
        }
        write('info', `Flow ${flowId}: ${value.event}${value.new_status ? ` → ${value.new_status}` : ''}.`);
        return 'handled';
      }

      default:
        write('info', `Field "${field}" has no handler; stored for inspection.`);
        return 'ignored';
    }
  }

  private async handleMessages(
    event: WebhookEvent,
    value: MessagesValue,
    write: (level: LogLine['level'], message: string) => void,
  ): Promise<Outcome> {
    const organizationId = event.organizationId!;
    const metaPhoneId = value.metadata?.phone_number_id;
    const phone = metaPhoneId
      ? await this.prisma.phoneNumber.findUnique({
          where: { organizationId_metaPhoneNumberId: { organizationId, metaPhoneNumberId: metaPhoneId } },
        })
      : null;
    if (!phone) {
      write(
        'warn',
        `Phone number ${metaPhoneId ?? '(missing)'} is not synced in this organization. Sync the WABA, then replay.`,
      );
      return 'ignored';
    }

    for (const message of value.messages ?? []) {
      await this.saveInbound(event, phone, message, value, write);
    }
    for (const status of value.statuses ?? []) {
      await this.saveStatus(event, status, write);
    }
    for (const error of value.errors ?? []) {
      write('error', `Meta reported an error: ${JSON.stringify(error)}`);
    }
    return 'handled';
  }

  private async saveInbound(
    event: WebhookEvent,
    phone: {
      id: string;
      organizationId: string;
      displayPhoneNumber: string | null;
      metaPhoneNumberId: string;
    },
    message: InboundMessage,
    value: MessagesValue,
    write: (level: LogLine['level'], message: string) => void,
  ) {
    // Users with usernames may come without wa_id; the business-scoped user id is the fallback key.
    const waId = message.from ?? message.from_user_id ?? 'unknown';
    const profile = value.contacts?.find(
      (c) =>
        (message.from != null && c.wa_id === message.from) ||
        (message.from_user_id != null && c.user_id === message.from_user_id),
    );
    const at = metaTimestamp(message.timestamp);

    const contact = await upsertWithRetry(() =>
      this.prisma.contact.upsert({
        where: { phoneNumberId_waId: { phoneNumberId: phone.id, waId } },
        create: {
          organizationId: phone.organizationId,
          phoneNumberId: phone.id,
          waId,
          profileName: profile?.profile?.name ?? null,
          lastMessageAt: at,
          lastInboundAt: at,
        },
        update: { profileName: profile?.profile?.name ?? undefined },
      }),
    );

    // Deliveries can arrive out of order, including retries after a newer outbound message.
    // Guard each timestamp independently so a stale inbound event cannot close the 24h window.
    await this.prisma.contact.updateMany({
      where: {
        id: contact.id,
        organizationId: phone.organizationId,
        OR: [{ lastInboundAt: null }, { lastInboundAt: { lt: at } }],
      },
      data: { lastInboundAt: at },
    });
    await this.prisma.contact.updateMany({
      where: {
        id: contact.id,
        organizationId: phone.organizationId,
        OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: at } }],
      },
      data: { lastMessageAt: at },
    });

    await upsertWithRetry(() =>
      this.prisma.message.upsert({
        where: { wamid: message.id },
        create: {
          organizationId: phone.organizationId,
          phoneNumberId: phone.id,
          contactId: contact.id,
          webhookEventId: event.id,
          wamid: message.id,
          direction: 'INBOUND',
          sender: waId,
          recipient: phone.displayPhoneNumber ?? phone.metaPhoneNumberId,
          type: message.type ?? 'unknown',
          payload: json(message),
          status: 'received',
          metaTimestamp: at,
        },
        update: {},
      }),
    );

    const media = inboundMedia(message);
    const mediaId = media?.id;
    if (media && mediaId) {
      await upsertWithRetry(() =>
        this.prisma.media.upsert({
          where: { phoneNumberId_metaMediaId: { phoneNumberId: phone.id, metaMediaId: mediaId } },
          create: {
            organizationId: phone.organizationId,
            phoneNumberId: phone.id,
            metaMediaId: mediaId,
            origin: 'RECEIVED',
            mimeType: media.mime_type ?? null,
            sha256: media.sha256 ?? null,
            fileName: media.filename ?? null,
          },
          update: {},
        }),
      );
    }
    write('info', `Inbound ${message.type} from ${waId} (${message.id}).`);
  }

  private async saveStatus(
    event: WebhookEvent,
    status: StatusUpdate,
    write: (level: LogLine['level'], message: string) => void,
  ) {
    const at = metaTimestamp(status.timestamp);
    const message = await this.prisma.message.findUnique({ where: { wamid: status.id } });
    // Messages are only matched within the same organization.
    const owned = message && message.organizationId === event.organizationId ? message : null;

    try {
      await this.prisma.messageStatusEvent.create({
        data: {
          messageId: owned?.id ?? null,
          wamid: status.id,
          status: status.status,
          recipientId: status.recipient_id ?? status.recipient_user_id ?? null,
          errors: status.errors ? json(status.errors) : undefined,
          pricing: status.pricing ? json(status.pricing) : undefined,
          conversation: status.conversation ? json(status.conversation) : undefined,
          metaTimestamp: at,
          webhookEventId: event.id,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      write('info', `Status ${status.status} for ${status.id} already recorded (duplicate delivery).`);
    }

    if (!owned) {
      write(
        'info',
        `Status ${status.status} for ${status.id}: message not sent through this app; event kept.`,
      );
      return;
    }
    if (shouldAdvanceStatus(owned.status, status.status)) {
      await this.prisma.message.update({
        where: { id: owned.id },
        data: {
          status: status.status,
          ...(status.errors ? { error: json(status.errors) } : {}),
          ...(status.pricing ? { pricing: json(status.pricing) } : {}),
          ...(status.conversation ? { conversation: json(status.conversation) } : {}),
        },
      });
    }
    write(
      status.status === 'failed' ? 'warn' : 'info',
      `Message ${status.id} → ${status.status}${status.errors ? `: ${JSON.stringify(status.errors)}` : ''}.`,
    );
  }

  private async findPhonesByDisplay(organizationId: string, metaWabaId: string | null, display: string) {
    const digits = display.replace(/\D/g, '');
    const phones = await this.prisma.phoneNumber.findMany({
      where: { organizationId, ...(metaWabaId ? { waba: { metaWabaId } } : {}) },
      select: { id: true, displayPhoneNumber: true },
    });
    return phones.filter((p) => (p.displayPhoneNumber ?? '').replace(/\D/g, '') === digits).map((p) => p.id);
  }
}
