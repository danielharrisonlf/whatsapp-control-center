import { OUTBOUND_MESSAGE_TYPES } from '@wacc/types';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CursorQuerySchema, pageSchema, zDate, zDateNullable } from '../../common/dto';
import { MetaErrorSchema } from '../meta/meta.dto';

const mediaRef = z.union([z.object({ id: z.string().min(1) }).loose(), z.object({ link: z.url() }).loose()]);

/** Minimal per-type checks before the payload goes to Meta (Meta stays the final validator). */
export const MESSAGE_PAYLOAD_SCHEMAS: Record<string, z.ZodType> = {
  text: z.object({ body: z.string().min(1).max(4096), preview_url: z.boolean().optional() }),
  template: z.object({
    name: z.string().min(1),
    language: z.object({ code: z.string().min(2) }).loose(),
    components: z.array(z.record(z.string(), z.unknown())).optional(),
  }),
  image: mediaRef,
  video: mediaRef,
  audio: mediaRef,
  document: mediaRef,
  sticker: mediaRef,
  location: z
    .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
    .loose(),
  contacts: z
    .array(z.object({ name: z.object({ formatted_name: z.string().min(1) }).loose() }).loose())
    .min(1)
    .max(257),
  reaction: z.object({ message_id: z.string().min(1), emoji: z.string().max(16) }),
  interactive: z.object({ type: z.string().min(1), action: z.record(z.string(), z.unknown()) }).loose(),
};

export class SendMessageDto extends createZodDto(
  z
    .object({
      phoneNumberId: z.uuid().describe('Local phone number ID (sender).'),
      to: z
        .string()
        .trim()
        .regex(/^\+?\d{6,20}$/, 'Recipient phone number in international format, digits only.')
        .transform((v) => v.replace(/^\+/, '')),
      type: z.enum(OUTBOUND_MESSAGE_TYPES),
      payload: z
        .unknown()
        .describe(
          'Object for the selected type, exactly as in the Cloud API (`text`, `template`, `image`...).',
        ),
      replyTo: z.string().optional().describe('wamid to quote (context.message_id).'),
    })
    .superRefine((v, ctx) => {
      const schema = MESSAGE_PAYLOAD_SCHEMAS[v.type];
      const result = schema?.safeParse(v.payload);
      if (result && !result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({
            code: 'custom',
            path: ['payload', ...issue.path.map(String)],
            message: issue.message,
          });
        }
      }
    })
    .meta({ id: 'SendMessageInput' }),
) {}

export const MessageSchema = z
  .object({
    id: z.string(),
    wamid: z.string().nullable(),
    direction: z.enum(['OUTBOUND', 'INBOUND']),
    phoneNumber: z.object({ id: z.string(), displayPhoneNumber: z.string().nullable() }),
    contactId: z.string().nullable(),
    sender: z.string(),
    recipient: z.string(),
    type: z.string(),
    payload: z.unknown(),
    status: z.string(),
    error: z.unknown().nullable(),
    pricing: z.unknown().nullable(),
    metaTimestamp: zDateNullable,
    createdAt: zDate,
    updatedAt: zDate,
  })
  .meta({ id: 'Message' });

export class MessagePageDto extends createZodDto(pageSchema(MessageSchema, 'MessagePage')) {}

export class MessageDetailDto extends createZodDto(
  MessageSchema.extend({
    statusEvents: z.array(
      z.object({
        id: z.string(),
        status: z.string(),
        errors: z.unknown().nullable(),
        pricing: z.unknown().nullable(),
        metaTimestamp: zDate,
      }),
    ),
    webhookEventId: z.string().nullable(),
  }).meta({ id: 'MessageDetail' }),
) {}

export class SendResultDto extends createZodDto(
  z
    .object({
      ok: z.boolean(),
      message: MessageSchema,
      request: z.object({ method: z.string(), url: z.string(), body: z.unknown() }),
      response: z.object({ status: z.number().nullable(), body: z.unknown() }),
      durationMs: z.number(),
      wamid: z.string().nullable(),
      messageStatus: z.string().nullable().describe('`accepted`, `held_for_quality_assessment` or `paused`.'),
      error: MetaErrorSchema.nullable(),
    })
    .meta({ id: 'SendResult' }),
) {}

export class MessageQueryDto extends createZodDto(
  CursorQuerySchema.extend({
    phoneNumberId: z.uuid().optional(),
    direction: z.enum(['OUTBOUND', 'INBOUND']).optional(),
    status: z.string().max(30).optional(),
    type: z.string().max(30).optional(),
    search: z.string().max(100).optional(),
  }),
) {}

export const ConversationSchema = z
  .object({
    id: z.string(),
    waId: z.string(),
    profileName: z.string().nullable(),
    phoneNumber: z.object({
      id: z.string(),
      displayPhoneNumber: z.string().nullable(),
      verifiedName: z.string().nullable(),
    }),
    lastMessageAt: zDateNullable,
    lastInboundAt: zDateNullable,
    /** True while the 24h customer service window is open (free-form messages allowed). */
    windowOpen: z.boolean(),
    windowExpiresAt: zDateNullable,
    lastMessage: MessageSchema.nullable(),
  })
  .meta({ id: 'Conversation' });

export class ConversationPageDto extends createZodDto(pageSchema(ConversationSchema, 'ConversationPage')) {}

export class ConversationQueryDto extends createZodDto(
  CursorQuerySchema.extend({ phoneNumberId: z.uuid().optional(), search: z.string().max(100).optional() }),
) {}

export class ConversationDto extends createZodDto(ConversationSchema) {}
