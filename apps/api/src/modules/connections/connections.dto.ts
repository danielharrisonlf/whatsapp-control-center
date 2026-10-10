import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { zDate, zDateNullable } from '../../common/dto';
import { MetaErrorSchema, SyncReportSchema } from '../meta/meta.dto';

const metaId = z
  .string()
  .trim()
  .regex(/^\d{5,25}$/, 'Meta IDs are numeric.');

export const CapabilitiesSchema = z
  .object({
    connected: z.boolean(),
    canManageAccounts: z.boolean(),
    canManageTemplates: z.boolean(),
    canManagePhoneNumbers: z.boolean(),
    canManageFlows: z.boolean(),
    canViewAnalytics: z.boolean(),
    canSendMessages: z.boolean(),
    canManageMedia: z.boolean(),
    canDiscoverBusinessAssets: z.boolean(),
    missingPermissions: z.array(z.string()),
  })
  .meta({ id: 'Capabilities' });
export class CapabilitiesDto extends createZodDto(CapabilitiesSchema) {}

export const MetaConfigSchema = z
  .object({
    graphApiVersion: z.string(),
    embeddedSignup: z.object({
      available: z.boolean(),
      appId: z.string().nullable(),
      configId: z.string().nullable(),
      /** Environment variables still missing for Embedded Signup. */
      missing: z.array(z.string()),
    }),
    platformWebhook: z.object({
      callbackUrl: z.string(),
      verifyTokenConfigured: z.boolean(),
      appSecretConfigured: z.boolean(),
    }),
  })
  .meta({ id: 'MetaConfig' });
export class MetaConfigDto extends createZodDto(MetaConfigSchema) {}

export const ConnectionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(['EMBEDDED_SIGNUP', 'MANUAL']),
    status: z.enum(['ACTIVE', 'ERROR', 'DISCONNECTED']),
    metaAppId: z.string(),
    usesPlatformApp: z.boolean(),
    accessTokenPreview: z.string(),
    tokenType: z.string().nullable(),
    tokenExpiresAt: zDateNullable,
    scopes: z.array(z.string()),
    capabilities: CapabilitiesSchema,
    lastCheckedAt: zDateNullable,
    lastSyncedAt: zDateNullable,
    lastError: MetaErrorSchema.nullable(),
    wabaCount: z.number(),
    webhook: z
      .object({ callbackUrl: z.string(), verifyTokenPreview: z.string(), verifiedAt: zDateNullable })
      .nullable()
      .describe('Per-connection webhook endpoint (manual connections with their own app).'),
    createdAt: zDate,
  })
  .meta({ id: 'MetaConnection' });
export class ConnectionDto extends createZodDto(ConnectionSchema) {}
export class ConnectionListDto extends createZodDto(
  z.array(ConnectionSchema).meta({ id: 'MetaConnectionList' }),
) {}

export class EmbeddedSignupDto extends createZodDto(
  z
    .object({
      code: z
        .string()
        .min(10)
        .max(2000)
        .describe('authResponse.code from FB.login (expires in ~30 seconds).'),
      wabaId: metaId.optional().describe('waba_id from the WA_EMBEDDED_SIGNUP message event.'),
      phoneNumberId: metaId.optional(),
      businessId: metaId.optional(),
    })
    .meta({ id: 'EmbeddedSignupInput' }),
) {}

export class ManualConnectionDto extends createZodDto(
  z
    .object({
      name: z.string().trim().min(1).max(80),
      appId: metaId,
      appSecret: z
        .string()
        .trim()
        .regex(/^[a-f0-9]{32}$/i, 'App secrets are 32 hexadecimal characters.'),
      accessToken: z.string().trim().min(20).max(2000),
      wabaId: metaId,
    })
    .meta({ id: 'ManualConnectionInput' }),
) {}

export class RotateCredentialsDto extends createZodDto(
  z
    .object({
      accessToken: z.string().trim().min(20).max(2000).optional(),
      appSecret: z
        .string()
        .trim()
        .regex(/^[a-f0-9]{32}$/i)
        .optional(),
    })
    .refine((v) => v.accessToken || v.appSecret, 'Provide a new access token or app secret.')
    .meta({ id: 'RotateCredentialsInput' }),
) {}

export class ConnectResultDto extends createZodDto(
  z.object({ connection: ConnectionSchema, report: SyncReportSchema }).meta({ id: 'ConnectResult' }),
) {}

export class SyncReportDto extends createZodDto(SyncReportSchema) {}

export const DiagnosticCheckSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    status: z.enum(['ok', 'warning', 'error', 'skipped']),
    detail: z.string(),
    hint: z.string().nullable(),
    error: MetaErrorSchema.nullable(),
  })
  .meta({ id: 'DiagnosticCheck' });

export class DiagnosticsDto extends createZodDto(
  z
    .object({
      connectionId: z.string(),
      checkedAt: zDate,
      graphApiVersion: z.string(),
      token: z.object({
        isValid: z.boolean(),
        type: z.string().nullable(),
        expiresAt: zDateNullable,
        scopes: z.array(z.string()),
      }),
      checks: z.array(DiagnosticCheckSchema),
    })
    .meta({ id: 'Diagnostics' }),
) {}
