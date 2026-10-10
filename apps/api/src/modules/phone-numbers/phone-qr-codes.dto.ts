import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class QrCodeParamsDto extends createZodDto(
  z.object({
    organizationId: z.uuid(),
    phoneId: z.uuid(),
    code: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  }),
) {}

const schema = z
  .object({
    code: z.string(),
    prefilledMessage: z.string(),
    deepLinkUrl: z.url(),
    qrImageUrl: z.url().nullable(),
  })
  .meta({ id: 'PhoneQrCode' });
export class PhoneQrCodeDto extends createZodDto(schema) {}
export class PhoneQrCodeListDto extends createZodDto(z.array(schema).meta({ id: 'PhoneQrCodeList' })) {}
export class CreatePhoneQrCodeDto extends createZodDto(
  z
    .object({
      prefilledMessage: z.string().trim().min(1).max(140),
      imageFormat: z.enum(['PNG', 'SVG']).default('PNG'),
    })
    .meta({ id: 'CreatePhoneQrCodeInput' }),
) {}
export class UpdatePhoneQrCodeDto extends createZodDto(
  z
    .object({
      prefilledMessage: z.string().trim().min(1).max(140),
    })
    .meta({ id: 'UpdatePhoneQrCodeInput' }),
) {}
