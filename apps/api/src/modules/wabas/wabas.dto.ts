import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { zDate, zDateNullable } from '../../common/dto';

export const WabaSummarySchema = z
  .object({
    id: z.string(),
    metaWabaId: z.string(),
    name: z.string().nullable(),
    displayLabel: z.string().nullable(),
    connection: z.object({ id: z.string(), name: z.string(), kind: z.string(), status: z.string() }),
    timezoneId: z.string().nullable(),
    currency: z.string().nullable(),
    accountReviewStatus: z.string().nullable(),
    businessVerificationStatus: z.string().nullable(),
    ownerBusinessName: z.string().nullable(),
    ownerBusinessId: z.string().nullable(),
    appSubscribed: z.boolean().nullable(),
    phoneNumberCount: z.number(),
    templateCounts: z.object({
      total: z.number(),
      approved: z.number(),
      pending: z.number(),
      rejected: z.number(),
    }),
    lastSyncedAt: zDateNullable,
    createdAt: zDate,
  })
  .meta({ id: 'WabaSummary' });
export class WabaListDto extends createZodDto(z.array(WabaSummarySchema).meta({ id: 'WabaList' })) {}

export class WabaDetailDto extends createZodDto(
  WabaSummarySchema.extend({
    messageTemplateNamespace: z.string().nullable(),
    ownershipType: z.string().nullable(),
    country: z.string().nullable(),
    isEnabledForInsights: z.boolean().nullable(),
    healthStatus: z
      .unknown()
      .nullable()
      .describe('`health_status` as returned by Meta (can_send_message + entities).'),
    subscribedApps: z.array(
      z.object({
        id: z.string().nullable(),
        name: z.string().nullable(),
        link: z.string().nullable(),
        overrideCallbackUri: z.string().nullable(),
      }),
    ),
    flowCount: z.number(),
  }).meta({ id: 'WabaDetail' }),
) {}

export class UpdateWabaDto extends createZodDto(
  z.object({ displayLabel: z.string().trim().max(80).nullable() }).meta({ id: 'UpdateWabaInput' }),
) {}
