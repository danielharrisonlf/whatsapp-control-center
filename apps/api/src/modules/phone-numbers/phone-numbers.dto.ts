import { BUSINESS_PROFILE_LIMITS, BUSINESS_VERTICALS } from '@wacc/types';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { zDate, zDateNullable } from '../../common/dto';

export const PhoneNumberSchema = z
  .object({
    id: z.string(),
    metaPhoneNumberId: z.string(),
    waba: z.object({ id: z.string(), metaWabaId: z.string(), name: z.string().nullable() }),
    displayPhoneNumber: z.string().nullable(),
    verifiedName: z.string().nullable(),
    displayLabel: z.string().nullable(),
    status: z.string().nullable(),
    codeVerificationStatus: z.string().nullable(),
    nameStatus: z.string().nullable(),
    qualityRating: z.string().nullable(),
    platformType: z.string().nullable(),
    throughputLevel: z.string().nullable(),
    messagingLimitTier: z.string().nullable(),
    isOfficialBusinessAccount: z.boolean().nullable(),
    accountMode: z.string().nullable(),
    lastOnboardedTime: zDateNullable,
    lastSyncedAt: zDateNullable,
    createdAt: zDate,
  })
  .meta({ id: 'PhoneNumber' });
export class PhoneNumberDto extends createZodDto(PhoneNumberSchema) {}
export class PhoneNumberListDto extends createZodDto(
  z.array(PhoneNumberSchema).meta({ id: 'PhoneNumberList' }),
) {}

export class PhoneListQueryDto extends createZodDto(z.object({ wabaId: z.uuid().optional() })) {}

export class UpdatePhoneDto extends createZodDto(
  z.object({ displayLabel: z.string().trim().max(80).nullable() }).meta({ id: 'UpdatePhoneInput' }),
) {}

export class AddPhoneDto extends createZodDto(
  z
    .object({
      wabaId: z.uuid(),
      cc: z.string().regex(/^\d{1,4}$/, 'Country calling code, digits only (e.g. 55).'),
      phoneNumber: z.string().regex(/^\d{4,15}$/, 'Phone number without the country code, digits only.'),
      verifiedName: z
        .string()
        .trim()
        .min(3)
        .max(512)
        .describe('Display name. Meta reviews it against the display name guidelines.'),
    })
    .meta({ id: 'AddPhoneInput' }),
) {}

export class RequestCodeDto extends createZodDto(
  z
    .object({
      method: z.enum(['SMS', 'VOICE']),
      language: z
        .string()
        .regex(/^[a-z]{2}(_[A-Z]{2})?$/)
        .default('en_US'),
    })
    .meta({ id: 'RequestCodeInput' }),
) {}

export class VerifyCodeDto extends createZodDto(
  z
    .object({ code: z.string().regex(/^\d{4,8}$/, 'Enter the digits you received.') })
    .meta({ id: 'VerifyCodeInput' }),
) {}

const pin = z.string().regex(/^\d{6}$/, 'The PIN has exactly 6 digits.');

export class RegisterPhoneDto extends createZodDto(
  z
    .object({
      pin: pin.describe('Existing two-step verification PIN, or a new one if none is set.'),
      dataLocalizationRegion: z
        .string()
        .regex(/^[A-Z]{2}$/)
        .optional()
        .describe('Local storage region (ISO 3166-1 alpha-2), if required by regulation.'),
    })
    .meta({ id: 'RegisterPhoneInput' }),
) {}

export class TwoStepPinDto extends createZodDto(z.object({ pin }).meta({ id: 'TwoStepPinInput' })) {}

const L = BUSINESS_PROFILE_LIMITS;
export const BusinessProfileSchema = z
  .object({
    about: z.string().nullable(),
    address: z.string().nullable(),
    description: z.string().nullable(),
    email: z.string().nullable(),
    vertical: z.string().nullable(),
    websites: z.array(z.string()),
    profilePictureUrl: z.string().nullable(),
    lastSyncedAt: zDateNullable,
    /** True when Meta could not be reached and the cached copy is shown. */
    stale: z.boolean(),
  })
  .meta({ id: 'BusinessProfile' });
export class BusinessProfileDto extends createZodDto(BusinessProfileSchema) {}

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);
export class UpdateBusinessProfileDto extends createZodDto(
  z
    .object({
      about: z.preprocess(emptyToUndefined, z.string().min(1).max(L.about).optional()),
      address: z.string().max(L.address).optional(),
      description: z.string().max(L.description).optional(),
      email: z.union([z.literal(''), z.email().max(L.email)]).optional(),
      vertical: z.enum(Object.keys(BUSINESS_VERTICALS) as [string, ...string[]]).optional(),
      websites: z
        .array(
          z
            .string()
            .max(L.website)
            .regex(/^https?:\/\//, 'Websites must start with http:// or https://'),
        )
        .max(L.websites)
        .optional(),
    })
    .meta({ id: 'UpdateBusinessProfileInput' }),
) {}
