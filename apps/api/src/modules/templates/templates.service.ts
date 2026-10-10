import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  draftFromMetaTemplate,
  EDITABLE_TEMPLATE_STATUSES,
  type MetaTemplateComponent,
  type MetaTemplateCreatePayload,
  validateTemplateDraft,
} from '@wacc/types';
import { afterCursor, iso, isoOrNull, toPage } from '../../common/dto';
import { badRequest, conflict, notFound } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MetaCredentialsService } from '../connections/meta-credentials.service';
import { MetaSyncService } from '../connections/meta-sync.service';
import { MetaApiError } from '../meta/meta-error';
import { MetaTemplateService } from '../meta/meta-template.service';
import { MetaUploadService, RESUMABLE_UPLOAD_TYPES } from '../meta/meta-upload.service';
import type { TemplateQueryDto } from './templates.dto';

const include = { waba: { select: { id: true, metaWabaId: true, name: true } } } as const;
type TemplateRow = Prisma.MessageTemplateGetPayload<{ include: typeof include }>;

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: MetaCredentialsService,
    private readonly sync: MetaSyncService,
    private readonly metaTemplates: MetaTemplateService,
    private readonly uploads: MetaUploadService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, q: TemplateQueryDto) {
    const where: Prisma.MessageTemplateWhereInput = {
      organizationId,
      ...(q.includeDeleted ? {} : { remoteDeletedAt: null }),
      ...(q.wabaId ? { wabaId: q.wabaId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.language ? { language: q.language } : {}),
      ...(q.search
        ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { metaTemplateId: q.search }] }
        : {}),
    };
    const rows = await this.prisma.messageTemplate.findMany({
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

  async facets(organizationId: string, wabaId?: string) {
    const where = { organizationId, remoteDeletedAt: null, ...(wabaId ? { wabaId } : {}) };
    const [statuses, categories, languages, latest] = await Promise.all([
      this.prisma.messageTemplate.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.messageTemplate.groupBy({ by: ['category'], where, _count: { _all: true } }),
      this.prisma.messageTemplate.groupBy({ by: ['language'], where, _count: { _all: true } }),
      this.prisma.messageTemplate.findFirst({
        where,
        orderBy: { lastSyncedAt: 'desc' },
        select: { lastSyncedAt: true },
      }),
    ]);
    const facet = <K extends string>(rows: ({ _count: { _all: number } } & Record<K, string>)[], key: K) =>
      rows.map((r) => ({ value: r[key], count: r._count._all })).sort((a, b) => b.count - a.count);
    return {
      statuses: facet(statuses, 'status'),
      categories: facet(categories, 'category'),
      languages: facet(languages, 'language'),
      lastSyncedAt: isoOrNull(latest?.lastSyncedAt),
    };
  }

  async get(organizationId: string, id: string) {
    const row = await this.prisma.messageTemplate.findFirst({ where: { id, organizationId }, include });
    if (!row) throw notFound('Template');
    return this.toDto(row);
  }

  /** Validates with the same rules as the builder, then creates at Meta and caches the result. */
  async create(organizationId: string, userId: string, wabaId: string, payload: MetaTemplateCreatePayload) {
    const issues = validateTemplateDraft(
      draftFromMetaTemplate({
        ...payload,
        parameterFormat: payload.parameter_format,
        components: payload.components,
      }),
    );
    const errors = issues.filter((i) => i.severity === 'error');
    if (errors.length > 0) throw badRequest('The template does not meet Meta requirements.', errors);

    const { waba, credentials } = await this.credentials.forWaba(organizationId, wabaId);
    this.credentials.requireScope(credentials, 'whatsapp_business_management');
    const existing = await this.prisma.messageTemplate.findUnique({
      where: { wabaId_name_language: { wabaId, name: payload.name, language: payload.language } },
    });
    if (existing && !existing.remoteDeletedAt) {
      throw conflict(
        `A template named "${payload.name}" already exists in ${payload.language}. Edit it or pick another name.`,
      );
    }

    const created = await this.metaTemplates.create(waba.metaWabaId, credentials.token, payload);
    // Read back the canonical version from Meta (status and category may already differ).
    const node = await this.metaTemplates.get(created.id, credentials.token).catch(() => ({
      id: created.id,
      name: payload.name,
      language: payload.language,
      status: created.status,
      category: created.category,
      parameter_format: payload.parameter_format,
      components: payload.components,
    }));
    const row = await this.sync.upsertTemplate(waba, node);
    await this.prisma.messageTemplate.update({ where: { id: row.id }, data: { createdById: userId } });
    await this.audit.record({
      organizationId,
      action: 'TEMPLATE_CREATED',
      resource: 'message_template',
      resourceId: row.id,
      metadata: {
        name: payload.name,
        language: payload.language,
        category: payload.category,
        metaTemplateId: created.id,
      },
    });
    return {
      template: await this.get(organizationId, row.id),
      warnings: issues
        .filter((i) => i.severity === 'warning')
        .map(({ path, message }) => ({ path, message })),
    };
  }

  async edit(
    organizationId: string,
    id: string,
    input: { components: MetaTemplateComponent[]; category?: string },
  ) {
    const row = await this.prisma.messageTemplate.findFirst({ where: { id, organizationId } });
    if (!row?.metaTemplateId) throw notFound('Template');
    if (!EDITABLE_TEMPLATE_STATUSES.includes(row.status)) {
      throw badRequest(
        `Templates with status ${row.status} cannot be edited. Only approved, rejected or paused templates can.`,
      );
    }
    if (input.category && row.status === 'APPROVED' && input.category !== row.category) {
      throw badRequest('The category of an approved template cannot be changed.');
    }
    const issues = validateTemplateDraft(
      draftFromMetaTemplate({
        name: row.name,
        language: row.language,
        category: input.category ?? row.category,
        parameterFormat: row.parameterFormat,
        components: input.components,
      }),
    ).filter((i) => i.severity === 'error');
    if (issues.length > 0) throw badRequest('The template does not meet Meta requirements.', issues);

    const { credentials } = await this.credentials.forWaba(organizationId, row.wabaId);
    await this.metaTemplates.edit(row.metaTemplateId, credentials.token, input);
    await this.audit.record({
      organizationId,
      action: 'TEMPLATE_EDITED',
      resource: 'message_template',
      resourceId: id,
      metadata: { name: row.name, language: row.language },
    });
    return this.refresh(organizationId, id);
  }

  async refresh(organizationId: string, id: string) {
    const row = await this.prisma.messageTemplate.findFirst({
      where: { id, organizationId },
      include: { waba: true },
    });
    if (!row?.metaTemplateId) throw notFound('Template');
    const { credentials } = await this.credentials.forWaba(organizationId, row.wabaId);
    try {
      const node = await this.metaTemplates.get(row.metaTemplateId, credentials.token);
      await this.sync.upsertTemplate(row.waba, node);
    } catch (error) {
      if (error instanceof MetaApiError && error.info.httpStatus === 404) {
        await this.prisma.messageTemplate.update({
          where: { id },
          data: { remoteDeletedAt: new Date(), status: 'DELETED' },
        });
      } else throw error;
    }
    return this.get(organizationId, id);
  }

  async delete(organizationId: string, id: string, allLanguages: boolean) {
    const row = await this.prisma.messageTemplate.findFirst({ where: { id, organizationId } });
    if (!row) throw notFound('Template');
    if (row.status === 'DISABLED') throw badRequest('Meta does not allow deleting disabled templates.');
    const { waba, credentials } = await this.credentials.forWaba(organizationId, row.wabaId);
    if (row.metaTemplateId) {
      await this.metaTemplates.delete(
        waba.metaWabaId,
        credentials.token,
        row.name,
        allLanguages ? undefined : row.metaTemplateId,
      );
    }
    await this.prisma.messageTemplate.updateMany({
      where: allLanguages ? { wabaId: row.wabaId, name: row.name } : { id },
      data: { remoteDeletedAt: new Date(), status: 'DELETED' },
    });
    await this.audit.record({
      organizationId,
      action: 'TEMPLATE_DELETED',
      resource: 'message_template',
      resourceId: id,
      metadata: { name: row.name, language: allLanguages ? 'all' : row.language },
    });
  }

  async syncAll(organizationId: string, wabaId?: string) {
    const wabas = await this.prisma.whatsAppBusinessAccount.findMany({
      where: { organizationId, ...(wabaId ? { id: wabaId } : {}) },
      include: { connection: true },
    });
    let synced = 0;
    const errors: { wabaId: string; message: string }[] = [];
    for (const waba of wabas) {
      try {
        const credentials = await this.credentials.forConnection(waba.connection);
        synced += await this.sync.syncTemplates(waba, credentials);
      } catch (error) {
        errors.push({
          wabaId: waba.id,
          message: error instanceof MetaApiError ? (error.info.userMessage ?? error.message) : 'Sync failed.',
        });
      }
    }
    return { synced, errors };
  }

  /** Uploads a header sample and returns the handle for `example.header_handle`. */
  async uploadHeaderSample(organizationId: string, wabaId: string, file?: Express.Multer.File) {
    if (!file) throw badRequest('Attach a sample file.');
    if (!RESUMABLE_UPLOAD_TYPES.includes(file.mimetype)) {
      throw badRequest('Header samples must be JPEG, PNG, MP4 or PDF.');
    }
    const { credentials } = await this.credentials.forWaba(organizationId, wabaId);
    const handle = await this.uploads.upload(credentials.appId, credentials.token, {
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
    });
    return { handle, fileName: file.originalname, mimeType: file.mimetype, size: file.size };
  }

  toDto(r: TemplateRow) {
    return {
      id: r.id,
      waba: r.waba,
      metaTemplateId: r.metaTemplateId,
      name: r.name,
      language: r.language,
      category: r.category,
      previousCategory: r.previousCategory,
      parameterFormat: r.parameterFormat,
      status: r.status,
      components: (Array.isArray(r.components) ? r.components : []) as MetaTemplateComponent[],
      qualityScore: r.qualityScore,
      rejectedReason: r.rejectedReason,
      subCategory: r.subCategory,
      lastSyncedAt: isoOrNull(r.lastSyncedAt),
      remoteDeletedAt: isoOrNull(r.remoteDeletedAt),
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    };
  }
}
