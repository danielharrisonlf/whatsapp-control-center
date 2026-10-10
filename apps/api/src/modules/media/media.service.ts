import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { MEDIA_TYPES, mediaKindForMime } from '@wacc/types';
import { afterCursor, iso, isoOrNull, toPage } from '../../common/dto';
import { badRequest, notFound } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MetaCredentialsService } from '../connections/meta-credentials.service';
import { MetaApiError } from '../meta/meta-error';
import { MetaMediaService } from '../meta/meta-media.service';

const include = { phoneNumber: { select: { id: true, displayPhoneNumber: true } } } as const;
type MediaRow = Prisma.MediaGetPayload<{ include: typeof include }>;

/** Uploaded media IDs expire after 7 days (Meta changelog, 2025-10). */
export const MEDIA_RETENTION_MS = 7 * 86_400_000;

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: MetaCredentialsService,
    private readonly metaMedia: MetaMediaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    organizationId: string,
    q: { limit: number; cursor?: string; phoneNumberId?: string; origin?: 'UPLOADED' | 'RECEIVED' },
  ) {
    const rows = await this.prisma.media.findMany({
      where: {
        AND: [
          {
            organizationId,
            ...(q.phoneNumberId ? { phoneNumberId: q.phoneNumberId } : {}),
            ...(q.origin ? { origin: q.origin } : {}),
          },
          afterCursor('createdAt', q.cursor),
        ],
      },
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

  async upload(organizationId: string, userId: string, phoneNumberId: string, file?: Express.Multer.File) {
    if (!file) throw badRequest('Attach a file.');
    const kind = mediaKindForMime(file.mimetype);
    if (!kind) throw badRequest(`${file.mimetype} is not a media type WhatsApp accepts.`);
    const limit = MEDIA_TYPES[kind].maxBytes;
    if (file.size > limit)
      throw badRequest(
        `${kind} files are limited to ${Math.round(limit / 1024 / 1024) || 0.5} MB by WhatsApp.`,
      );

    const { phone, credentials } = await this.credentials.forPhone(organizationId, phoneNumberId);
    this.credentials.requireScope(credentials, 'whatsapp_business_messaging');
    const { id: metaMediaId } = await this.metaMedia.upload(phone.metaPhoneNumberId, credentials.token, {
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
    });
    const row = await this.prisma.media.create({
      data: {
        organizationId,
        phoneNumberId: phone.id,
        metaMediaId,
        origin: 'UPLOADED',
        mimeType: file.mimetype,
        fileSize: file.size,
        fileName: file.originalname,
        uploadedById: userId,
      },
      include,
    });
    await this.audit.record({
      organizationId,
      action: 'MEDIA_UPLOADED',
      resource: 'media',
      resourceId: row.id,
      metadata: { metaMediaId, mimeType: file.mimetype, size: file.size },
    });
    return this.toDto(row);
  }

  /** Refreshes metadata from Meta. A 404 means the media expired or was deleted. */
  async refresh(organizationId: string, id: string) {
    const row = await this.find(organizationId, id);
    const { phone, credentials } = await this.credentials.forPhone(organizationId, row.phoneNumberId);
    try {
      const node = await this.metaMedia.get(row.metaMediaId, credentials.token, phone.metaPhoneNumberId);
      const updated = await this.prisma.media.update({
        where: { id },
        data: { mimeType: node.mime_type, fileSize: node.file_size, sha256: node.sha256, deletedAt: null },
        include,
      });
      return this.toDto(updated);
    } catch (error) {
      if (error instanceof MetaApiError && (error.info.httpStatus === 404 || error.info.metaCode === 100)) {
        const updated = await this.prisma.media.update({
          where: { id },
          data: { deletedAt: new Date() },
          include,
        });
        return this.toDto(updated);
      }
      throw error;
    }
  }

  /** Streams the file through the API: Meta URLs need the token and expire after 5 minutes. */
  async download(organizationId: string, id: string) {
    const row = await this.find(organizationId, id);
    const { phone, credentials } = await this.credentials.forPhone(organizationId, row.phoneNumberId);
    const file = await this.metaMedia.download(row.metaMediaId, credentials.token, phone.metaPhoneNumberId);
    return {
      data: file.data,
      contentType: file.node.mime_type ?? file.contentType ?? 'application/octet-stream',
      fileName: row.fileName ?? row.metaMediaId,
    };
  }

  async delete(organizationId: string, id: string) {
    const row = await this.find(organizationId, id);
    const { phone, credentials } = await this.credentials.forPhone(organizationId, row.phoneNumberId);
    await this.metaMedia.delete(row.metaMediaId, credentials.token, phone.metaPhoneNumberId);
    await this.prisma.media.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({
      organizationId,
      action: 'MEDIA_DELETED',
      resource: 'media',
      resourceId: id,
      metadata: { metaMediaId: row.metaMediaId },
    });
  }

  private async find(organizationId: string, id: string) {
    const row = await this.prisma.media.findFirst({ where: { id, organizationId } });
    if (!row) throw notFound('Media');
    return row;
  }

  toDto(r: MediaRow) {
    const expiresAt = r.origin === 'UPLOADED' ? new Date(r.createdAt.getTime() + MEDIA_RETENTION_MS) : null;
    return {
      id: r.id,
      metaMediaId: r.metaMediaId,
      phoneNumber: r.phoneNumber,
      origin: r.origin,
      mimeType: r.mimeType,
      kind: r.mimeType ? mediaKindForMime(r.mimeType) : null,
      fileSize: r.fileSize,
      sha256: r.sha256,
      fileName: r.fileName,
      deletedAt: isoOrNull(r.deletedAt),
      estimatedExpiresAt: isoOrNull(expiresAt),
      createdAt: iso(r.createdAt),
    };
  }
}
