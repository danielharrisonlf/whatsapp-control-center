import { TEMPLATE_CATEGORIES } from '@wacc/types';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CursorQuerySchema, pageSchema, zDate, zDateNullable } from '../../common/dto';

const ComponentSchema = z.looseObject({ type: z.string() }).meta({ id: 'TemplateComponent' });

export const TemplateSchema = z
  .object({
    id: z.string(),
    waba: z.object({ id: z.string(), metaWabaId: z.string(), name: z.string().nullable() }),
    metaTemplateId: z.string().nullable(),
    name: z.string(),
    language: z.string(),
    category: z.string(),
    previousCategory: z.string().nullable(),
    parameterFormat: z.string().nullable(),
    status: z.string(),
    components: z.array(ComponentSchema),
    qualityScore: z.string().nullable(),
    rejectedReason: z.string().nullable(),
    subCategory: z.string().nullable(),
    lastSyncedAt: zDateNullable,
    remoteDeletedAt: zDateNullable,
    createdAt: zDate,
    updatedAt: zDate,
  })
  .meta({ id: 'MessageTemplate' });
export class TemplateDto extends createZodDto(TemplateSchema) {}
export class TemplatePageDto extends createZodDto(pageSchema(TemplateSchema, 'MessageTemplatePage')) {}

export class TemplateQueryDto extends createZodDto(
  CursorQuerySchema.extend({
    wabaId: z.uuid().optional(),
    status: z.string().max(40).optional(),
    category: z.string().max(40).optional(),
    language: z.string().max(10).optional(),
    search: z.string().max(200).optional(),
    includeDeleted: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
  }),
) {}

export class TemplateFacetsDto extends createZodDto(
  z
    .object({
      statuses: z.array(z.object({ value: z.string(), count: z.number() })),
      categories: z.array(z.object({ value: z.string(), count: z.number() })),
      languages: z.array(z.object({ value: z.string(), count: z.number() })),
      lastSyncedAt: zDateNullable,
    })
    .meta({ id: 'TemplateFacets' }),
) {}

/** The exact payload sent to POST /{waba-id}/message_templates (what the JSON tab shows). */
export const TemplatePayloadSchema = z
  .object({
    name: z.string().min(1).max(512),
    language: z.string().min(2).max(10),
    category: z.enum(TEMPLATE_CATEGORIES),
    parameter_format: z.enum(['POSITIONAL', 'NAMED']).optional(),
    allow_category_change: z.boolean().optional(),
    components: z.array(ComponentSchema).min(1),
  })
  .meta({ id: 'TemplateCreatePayload' });

export class CreateTemplateDto extends createZodDto(
  z.object({ wabaId: z.uuid(), payload: TemplatePayloadSchema }).meta({ id: 'CreateTemplateInput' }),
) {}

export class EditTemplateDto extends createZodDto(
  z
    .object({
      components: z.array(ComponentSchema).min(1),
      category: z.enum(TEMPLATE_CATEGORIES).optional(),
    })
    .meta({ id: 'EditTemplateInput' }),
) {}

export class DeleteTemplateQueryDto extends createZodDto(
  z.object({
    allLanguages: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true')
      .describe('Delete every language of this template name.'),
  }),
) {}

export class TemplateFacetsQueryDto extends createZodDto(z.object({ wabaId: z.uuid().optional() })) {}

export class SyncTemplatesDto extends createZodDto(
  z.object({ wabaId: z.uuid().optional() }).meta({ id: 'SyncTemplatesInput' }),
) {}

export class SyncTemplatesResultDto extends createZodDto(
  z
    .object({
      synced: z.number(),
      errors: z.array(z.object({ wabaId: z.string(), message: z.string() })),
    })
    .meta({ id: 'SyncTemplatesResult' }),
) {}

export class MediaHandleDto extends createZodDto(
  z
    .object({ handle: z.string(), fileName: z.string(), mimeType: z.string(), size: z.number() })
    .meta({ id: 'MediaHandle' }),
) {}

export class CreateTemplateResultDto extends createZodDto(
  z
    .object({
      template: TemplateSchema,
      warnings: z.array(z.object({ path: z.string(), message: z.string() })),
    })
    .meta({ id: 'CreateTemplateResult' }),
) {}
