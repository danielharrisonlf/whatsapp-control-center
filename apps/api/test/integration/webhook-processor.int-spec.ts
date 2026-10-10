import type { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebhookProcessorService } from '../../src/modules/webhooks/webhook-processor.service';
import { PrismaService } from '../../src/prisma/prisma.service';

/** The processor against a real PostgreSQL database (no HTTP, no Meta). */
const prisma = new PrismaService();
const processor = new WebhookProcessorService(prisma);
const suffix = Date.now().toString().slice(-6);

let orgA: string;
let orgB: string;
let phoneA: { id: string; metaPhoneNumberId: string };

async function makeOrg(name: string, metaWabaId: string, metaPhoneNumberId: string) {
  const org = await prisma.organization.create({ data: { name, slug: `${name}-${suffix}` } });
  const connection = await prisma.metaConnection.create({
    data: {
      organizationId: org.id,
      name: 'c',
      kind: 'MANUAL',
      metaAppId: '1',
      accessTokenCiphertext: 'x',
      accessTokenPreview: 'x',
    },
  });
  const waba = await prisma.whatsAppBusinessAccount.create({
    data: { organizationId: org.id, connectionId: connection.id, metaWabaId },
  });
  const phone = await prisma.phoneNumber.create({
    data: {
      organizationId: org.id,
      wabaId: waba.id,
      metaPhoneNumberId,
      displayPhoneNumber: '+55 91 90000-0000',
    },
  });
  return { org, waba, phone };
}

async function deliver(organizationId: string, payload: unknown) {
  const event = await prisma.webhookEvent.create({
    data: {
      organizationId,
      endpoint: 'platform',
      signatureValid: true,
      responseStatus: 200,
      payload: payload as Prisma.InputJsonValue,
      headers: {},
    },
  });
  return processor.process(event.id);
}

const statusPayload = (phoneNumberId: string, wamid: string, status: string, ts: number) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'W',
      changes: [
        {
          field: 'messages',
          value: {
            metadata: { phone_number_id: phoneNumberId },
            statuses: [{ id: wamid, status, timestamp: String(ts) }],
          },
        },
      ],
    },
  ],
});

const inboundPayload = (
  phoneNumberId: string,
  messages: { id: string; from?: string; from_user_id?: string; timestamp: string; type: string }[],
  contacts: { wa_id?: string; user_id?: string; profile?: { name: string } }[] = [],
) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'W',
      changes: [
        { field: 'messages', value: { metadata: { phone_number_id: phoneNumberId }, contacts, messages } },
      ],
    },
  ],
});

beforeAll(async () => {
  const a = await makeOrg('org-a', `WA${suffix}`, `PA${suffix}`);
  const b = await makeOrg('org-b', `WB${suffix}`, `PB${suffix}`);
  orgA = a.org.id;
  orgB = b.org.id;
  phoneA = a.phone;
  await prisma.message.create({
    data: {
      organizationId: orgA,
      phoneNumberId: a.phone.id,
      wamid: `wamid.A${suffix}`,
      direction: 'OUTBOUND',
      sender: 's',
      recipient: 'r',
      type: 'text',
      payload: {},
      status: 'accepted',
    },
  });
  await prisma.messageTemplate.create({
    data: {
      organizationId: orgA,
      wabaId: a.waba.id,
      metaTemplateId: `T${suffix}`,
      name: 'promo',
      language: 'en_US',
      category: 'MARKETING',
      status: 'PENDING',
      components: [],
    },
  });
});

afterAll(() => prisma.$disconnect());

describe('WebhookProcessorService', () => {
  it('keeps inbound and last-message times monotonic across late deliveries and replays', async () => {
    const waId = `5511999${suffix}`;
    const newer = inboundPayload(phoneA.metaPhoneNumberId, [
      { id: `wamid.in.new${suffix}`, from: waId, timestamp: '2000', type: 'text' },
    ]);
    const older = inboundPayload(phoneA.metaPhoneNumberId, [
      { id: `wamid.in.old${suffix}`, from: waId, timestamp: '1000', type: 'text' },
    ]);
    await deliver(orgA, newer);
    await deliver(orgA, older);
    await deliver(orgA, older);

    const contact = await prisma.contact.findUniqueOrThrow({
      where: { phoneNumberId_waId: { phoneNumberId: phoneA.id, waId } },
    });
    expect(contact.lastInboundAt).toEqual(new Date(2000 * 1000));
    expect(contact.lastMessageAt).toEqual(new Date(2000 * 1000));
    expect(await prisma.message.count({ where: { wamid: `wamid.in.old${suffix}` } })).toBe(1);

    // A more recent outbound send must remain the last message after another inbound delivery.
    await prisma.contact.update({
      where: { id: contact.id },
      data: { lastMessageAt: new Date(3000 * 1000) },
    });
    await deliver(
      orgA,
      inboundPayload(phoneA.metaPhoneNumberId, [
        { id: `wamid.in.mid${suffix}`, from: waId, timestamp: '2500', type: 'text' },
      ]),
    );
    const updated = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(updated.lastInboundAt).toEqual(new Date(2500 * 1000));
    expect(updated.lastMessageAt).toEqual(new Date(3000 * 1000));
  });

  it('matches profiles only by identifiers supplied in each message', async () => {
    const waId = `5511888${suffix}`;
    const userId = `user-${suffix}`;
    await deliver(
      orgA,
      inboundPayload(
        phoneA.metaPhoneNumberId,
        [
          { id: `wamid.profile.wa${suffix}`, from: waId, timestamp: '3000', type: 'text' },
          { id: `wamid.profile.user${suffix}`, from_user_id: userId, timestamp: '3001', type: 'text' },
        ],
        [
          { user_id: userId, profile: { name: 'User profile' } },
          { wa_id: waId, profile: { name: 'WA profile' } },
        ],
      ),
    );
    const contacts = await prisma.contact.findMany({
      where: { phoneNumberId: phoneA.id, waId: { in: [waId, userId] } },
    });
    expect(contacts).toHaveLength(2);
    expect(Object.fromEntries(contacts.map((contact) => [contact.waId, contact.profileName]))).toEqual({
      [waId]: 'WA profile',
      [userId]: 'User profile',
    });
  });

  it('does not update the same contact identifier under another organization', async () => {
    const waId = `5511777${suffix}`;
    const otherPhone = await prisma.phoneNumber.findUniqueOrThrow({
      where: { organizationId_metaPhoneNumberId: { organizationId: orgB, metaPhoneNumberId: `PB${suffix}` } },
    });
    await deliver(
      orgA,
      inboundPayload(phoneA.metaPhoneNumberId, [
        { id: `wamid.isolated.a${suffix}`, from: waId, timestamp: '4000', type: 'text' },
      ]),
    );
    await deliver(
      orgB,
      inboundPayload(otherPhone.metaPhoneNumberId, [
        { id: `wamid.isolated.b${suffix}`, from: waId, timestamp: '1000', type: 'text' },
      ]),
    );
    const contacts = await prisma.contact.findMany({ where: { waId } });
    expect(contacts).toHaveLength(2);
    expect(contacts.find((contact) => contact.organizationId === orgA)?.lastInboundAt).toEqual(
      new Date(4000 * 1000),
    );
    expect(contacts.find((contact) => contact.organizationId === orgB)?.lastInboundAt).toEqual(
      new Date(1000 * 1000),
    );
  });

  it('handles out-of-order statuses without moving backwards', async () => {
    const wamid = `wamid.A${suffix}`;
    await deliver(orgA, statusPayload(phoneA.metaPhoneNumberId, wamid, 'read', 1000));
    await deliver(orgA, statusPayload(phoneA.metaPhoneNumberId, wamid, 'delivered', 900));
    const message = await prisma.message.findUniqueOrThrow({
      where: { wamid },
      include: { statusEvents: true },
    });
    expect(message.status).toBe('read');
    expect(message.statusEvents.map((e) => e.status).sort()).toEqual(['delivered', 'read']);
  });

  it('never updates a message that belongs to another organization', async () => {
    const event = await deliver(orgB, statusPayload(`PB${suffix}`, `wamid.A${suffix}`, 'failed', 2000));
    expect(event.processingStatus).toBe('PROCESSED');
    const message = await prisma.message.findUniqueOrThrow({ where: { wamid: `wamid.A${suffix}` } });
    expect(message.status).toBe('read');
  });

  it('applies template status and quality updates', async () => {
    await deliver(orgA, {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'W',
          changes: [
            {
              field: 'message_template_status_update',
              value: { event: 'REJECTED', message_template_id: `T${suffix}`, reason: 'PROMOTIONAL' },
            },
          ],
        },
      ],
    });
    await deliver(orgA, {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'W',
          changes: [
            {
              field: 'message_template_quality_update',
              value: { message_template_id: `T${suffix}`, new_quality_score: 'YELLOW' },
            },
          ],
        },
      ],
    });
    const template = await prisma.messageTemplate.findFirstOrThrow({
      where: { metaTemplateId: `T${suffix}` },
    });
    expect(template).toMatchObject({
      status: 'REJECTED',
      rejectedReason: 'PROMOTIONAL',
      qualityScore: 'YELLOW',
    });
  });

  it('stores unknown fields as ignored, with a log line', async () => {
    const event = await deliver(orgA, {
      object: 'whatsapp_business_account',
      entry: [{ id: 'W', changes: [{ field: 'some_future_field', value: {} }] }],
    });
    expect(event.processingStatus).toBe('IGNORED');
    expect(JSON.stringify(event.processingLog)).toContain('some_future_field');
  });

  it('ignores messages for phone numbers that are not synced, explaining why', async () => {
    const event = await deliver(orgA, statusPayload('UNKNOWN_PHONE', 'wamid.X', 'sent', 1));
    expect(event.processingStatus).toBe('IGNORED');
    expect(JSON.stringify(event.processingLog)).toMatch(/not synced/);
  });
});
