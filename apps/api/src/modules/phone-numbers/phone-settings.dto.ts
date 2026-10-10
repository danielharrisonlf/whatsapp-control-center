import { createPublicKey } from 'node:crypto';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const commerce = z.object({ isCartEnabled: z.boolean(), isCatalogVisible: z.boolean() });
export class PhoneCommerceSettingsDto extends createZodDto(commerce.meta({ id: 'PhoneCommerceSettings' })) {}
export class UpdatePhoneCommerceSettingsDto extends createZodDto(
  commerce
    .partial()
    .refine((value) => Object.keys(value).length > 0, 'Choose a setting to update.')
    .meta({ id: 'UpdatePhoneCommerceSettingsInput' }),
) {}

export class PhoneEncryptionDto extends createZodDto(
  z
    .object({ businessPublicKey: z.string().nullable(), signatureStatus: z.string().nullable() })
    .meta({ id: 'PhoneEncryption' }),
) {}

export class SetPhoneEncryptionDto extends createZodDto(
  z
    .object({
      businessPublicKey: z
        .string()
        .trim()
        .max(8192)
        .refine((value) => {
          // createPublicKey also accepts private keys: reject them before parsing or logging.
          if (!/^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----$/.test(value)) return false;
          try {
            const key = createPublicKey(value);
            return key.asymmetricKeyType === 'rsa' && key.asymmetricKeyDetails?.modulusLength === 2048;
          } catch {
            return false;
          }
        }, 'Provide a valid 2048-bit RSA public key in PEM format. Never submit a private key.'),
    })
    .meta({ id: 'SetPhoneEncryptionInput' }),
) {}

export class BlockedUsersQueryDto extends createZodDto(
  z.object({
    after: z.string().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  }),
) {}
export class BlockedUsersPageDto extends createZodDto(
  z
    .object({ items: z.array(z.object({ waId: z.string() })), nextCursor: z.string().nullable() })
    .meta({ id: 'BlockedUsersPage' }),
) {}
export class ChangeBlockedUsersDto extends createZodDto(
  z
    .object({
      users: z
        .array(
          z
            .string()
            .trim()
            .regex(/^\+?\d{6,20}$/, 'Use an international phone number.'),
        )
        .min(1)
        .max(100)
        .refine(
          (users) => new Set(users.map((user) => user.replace(/^\+/, ''))).size === users.length,
          'Each phone number must be unique.',
        ),
    })
    .meta({ id: 'ChangeBlockedUsersInput' }),
) {}
export class ChangeBlockedUsersResultDto extends createZodDto(
  z
    .object({
      successful: z.array(z.object({ input: z.string(), waId: z.string().nullable() })),
      failed: z.array(z.unknown()),
    })
    .meta({ id: 'ChangeBlockedUsersResult' }),
) {}
