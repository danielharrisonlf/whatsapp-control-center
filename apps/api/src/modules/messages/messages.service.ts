import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { afterCursor, iso, isoOrNull, toPage } from '../../common/dto';
import { badRequest, notFound } from '../../common/errors';
import { sanitizeUrl } from '../../common/sanitize';
import { PrismaService } from '../../prisma/prisma.service';
import { MetaCredentialsService } from '../connections/meta-credentials.service';
import { MetaApiError } from '../meta/meta-error';
import { MetaGraphClient } from '../meta/meta-graph.client';
import { MetaMessageService } from '../meta/meta-message.service';
import type { ConversationQueryDto, MessageQueryDto, SendMessageDto } from './messages.dto';

const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const include = { phoneNumber: { select: { id: true, displayPhoneNumber: true } } } as const;
type MessageRow = Prisma.MessageGetPayload<{ include: typeof include }>;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: MetaCredentialsService,
    private readonly metaMessages: MetaMessageService,
    private readonly graph: MetaGraphClient,
  ) {}

  /**
   * Sends a message and records it, whether Meta accepts or rejects it. Meta errors are part of
   * the result (the playground shows them), not an HTTP error of this endpoint.
   */
  async send(organizationId: string, userId: string, input: SendMessageDto) {
    const { phone, credentials } = await this.credentials.forPhone(organizationId, input.phoneNumberId);
    this.credentials.requireScope(credentials, 'whatsapp_business_messaging');

    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: input.type,
      [input.type]: input.payload,
      ...(input.replyTo ? { context: { message_id: input.replyTo } } : {}),
    };
    const contact = await this.prisma.contact.upsert({
      where: { phoneNumberId_waId: { phoneNumberId: phone.id, waId: input.to } },
      create: { organizationId, phoneNumberId: phone.id, waId: input.to, lastMessageAt: new Date() },
      update: { lastMessageAt: new Date() },
    });

    const started = performance.now();
    let status: number | null = null;
    let responseBody: unknown = null;
    let wamid: string | null = null;
    let messageStatus: string | null = null;
    let error: MetaApiError['info'] | null = null;
    try {
      const res = await this.metaMessages.send(phone.metaPhoneNumberId, credentials.token, body);
      status = res.status;
      responseBody = res.data;
      wamid = res.data.messages?.[0]?.id ?? null;
      messageStatus = res.data.messages?.[0]?.message_status ?? null;
    } catch (e) {
      if (!(e instanceof MetaApiError)) throw e;
      error = e.info;
      status = e.info.httpStatus || null;
      responseBody = e.info.raw;
    }
    const durationMs = Math.round(performance.now() - started);

    const message = await this.prisma.message.create({
      data: {
        organizationId,
        phoneNumberId: phone.id,
        contactId: contact.id,
        wamid,
        direction: 'OUTBOUND',
        sender: phone.displayPhoneNumber ?? phone.metaPhoneNumberId,
        recipient: input.to,
        type: input.type,
        payload: body as Prisma.InputJsonValue,
        status: error ? 'failed' : (messageStatus ?? 'accepted'),
        error: error ? (error as unknown as Prisma.InputJsonValue) : undefined,
        sentById: userId,
      },
      include,
    });

    return {
      ok: !error,
      message: this.toDto(message),
      request: {
        method: 'POST',
        url: sanitizeUrl(this.graph.buildUrl(`/${phone.metaPhoneNumberId}/messages`)),
        body,
      },
      response: { status, body: responseBody },
      durationMs,
      wamid,
      messageStatus,
      error,
    };
  }

  async list(organizationId: string, q: MessageQueryDto) {
    const where: Prisma.MessageWhereInput = {
      organizationId,
      ...(q.phoneNumberId ? { phoneNumberId: q.phoneNumberId } : {}),
      ...(q.direction ? { direction: q.direction } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.search
        ? {
            OR: [
              { wamid: q.search },
              { recipient: { contains: q.search } },
              { sender: { contains: q.search } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.message.findMany({
      where: { AND: [where, afterCursor('createdAt', q.cursor)] },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    return toPage(
      rows,
      q.limit,
      (r) => r.createdAt,
      (r) => this.toDto(r),
    );
  }

  async get(organizationId: string, id: string) {
    const row = await this.prisma.message.findFirst({
      where: { id, organizationId },
      include: { ...include, statusEvents: { orderBy: { metaTimestamp: 'asc' } } },
    });
    if (!row) throw notFound('Message');
    return {
      ...this.toDto(row),
      webhookEventId: row.webhookEventId,
      statusEvents: row.statusEvents.map((e) => ({
        id: e.id,
        status: e.status,
        errors: e.errors,
        pricing: e.pricing,
        metaTimestamp: iso(e.metaTimestamp),
      })),
    };
  }

  async conversations(organizationId: string, q: ConversationQueryDto) {
    const where: Prisma.ContactWhereInput = {
      organizationId,
      lastMessageAt: { not: null },
      ...(q.phoneNumberId ? { phoneNumberId: q.phoneNumberId } : {}),
      ...(q.search
        ? {
            OR: [
              { waId: { contains: q.search } },
              { profileName: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.contact.findMany({
      where: { AND: [where, afterCursor('lastMessageAt', q.cursor)] },
      include: {
        phoneNumber: { select: { id: true, displayPhoneNumber: true, verifiedName: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, include },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    return toPage(
      rows,
      q.limit,
      (r) => r.lastMessageAt!,
      (r) => this.conversationDto(r),
    );
  }

  async conversation(organizationId: string, contactId: string) {
    const row = await this.prisma.contact.findFirst({
      where: { id: contactId, organizationId },
      include: {
        phoneNumber: { select: { id: true, displayPhoneNumber: true, verifiedName: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, include },
      },
    });
    if (!row) throw notFound('Conversation');
    return this.conversationDto(row);
  }

  /** Messages of one conversation, newest first (the UI reverses them). */
  async conversationMessages(
    organizationId: string,
    contactId: string,
    q: { limit: number; cursor?: string },
  ) {
    const rows = await this.prisma.message.findMany({
      where: { AND: [{ organizationId, contactId }, afterCursor('createdAt', q.cursor)] },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    return toPage(
      rows,
      q.limit,
      (r) => r.createdAt,
      (r) => this.toDto(r),
    );
  }

  async markAsRead(organizationId: string, id: string, typing = false) {
    const message = await this.prisma.message.findFirst({
      where: { id, organizationId, direction: 'INBOUND' },
    });
    if (!message?.wamid) throw notFound('Inbound message');
    const { phone, credentials } = await this.credentials.forPhone(organizationId, message.phoneNumberId);
    this.credentials.requireScope(credentials, 'whatsapp_business_messaging');
    const result = await this.metaMessages.markAsRead(
      phone.metaPhoneNumberId,
      credentials.token,
      message.wamid,
      typing,
    );
    if (!result.success) throw badRequest('Meta did not confirm the read receipt.');
    await this.prisma.message.update({ where: { id }, data: { status: 'read' } });
  }

  private conversationDto(
    r: Prisma.ContactGetPayload<{
      include: {
        phoneNumber: { select: { id: true; displayPhoneNumber: true; verifiedName: true } };
        messages: { include: typeof include };
      };
    }>,
  ) {
    const expires = r.lastInboundAt ? new Date(r.lastInboundAt.getTime() + CUSTOMER_SERVICE_WINDOW_MS) : null;
    return {
      id: r.id,
      waId: r.waId,
      profileName: r.profileName,
      phoneNumber: r.phoneNumber,
      lastMessageAt: isoOrNull(r.lastMessageAt),
      lastInboundAt: isoOrNull(r.lastInboundAt),
      windowOpen: Boolean(expires && expires > new Date()),
      windowExpiresAt: isoOrNull(expires),
      lastMessage: r.messages[0] ? this.toDto(r.messages[0]) : null,
    };
  }

  toDto(r: MessageRow) {
    return {
      id: r.id,
      wamid: r.wamid,
      direction: r.direction,
      phoneNumber: r.phoneNumber,
      contactId: r.contactId,
      sender: r.sender,
      recipient: r.recipient,
      type: r.type,
      payload: r.payload,
      status: r.status,
      error: r.error,
      pricing: r.pricing,
      metaTimestamp: isoOrNull(r.metaTimestamp),
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    };
  }
}
