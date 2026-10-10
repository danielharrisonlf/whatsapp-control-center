import { z } from 'zod';

/** Normalized Graph API error (see MetaErrorInfo in @wacc/types). */
export const MetaErrorSchema = z
  .object({
    httpStatus: z.number(),
    metaCode: z.number().nullable(),
    metaSubcode: z.number().nullable(),
    type: z.string().nullable(),
    message: z.string(),
    userTitle: z.string().nullable(),
    userMessage: z.string().nullable(),
    details: z.string().nullable(),
    traceId: z.string().nullable(),
    isTransient: z.boolean(),
    raw: z.unknown(),
  })
  .meta({ id: 'MetaError' });

export const ErrorBodySchema = z
  .object({
    statusCode: z.number(),
    error: z.string(),
    message: z.string(),
    code: z.string(),
    requestId: z.string().optional(),
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    meta: MetaErrorSchema.optional(),
  })
  .meta({ id: 'ApiError' });

export const SyncReportSchema = z
  .object({
    wabas: z.number(),
    phoneNumbers: z.number(),
    templates: z.number(),
    flows: z.number(),
    errors: z.array(
      z.object({ resource: z.string(), id: z.string(), message: z.string(), code: z.number().nullable() }),
    ),
  })
  .meta({ id: 'SyncReport' });
