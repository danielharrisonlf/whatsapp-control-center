import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { iso, isoOrNull } from '../../common/dto';
import { badRequest, notFound } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MetaCredentialsService } from '../connections/meta-credentials.service';
import { phoneDataFromMeta } from '../connections/meta-sync.service';
import { MetaApiError } from '../meta/meta-error';
import { MetaPhoneNumberService } from '../meta/meta-phone-number.service';
import { MetaUploadService, RESUMABLE_UPLOAD_TYPES } from '../meta/meta-upload.service';
import type {
  AddPhoneDto,
  RegisterPhoneDto,
  RequestCodeDto,
  UpdateBusinessProfileDto,
} from './phone-numbers.dto';

const include = { waba: { select: { id: true, metaWabaId: true, name: true } } } as const;
type PhoneRow = Prisma.PhoneNumberGetPayload<{ include: typeof include }>;

@Injectable()
export class PhoneNumbersService {
  private readonly logger = new Logger(PhoneNumbersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: MetaCredentialsService,
    private readonly metaPhones: MetaPhoneNumberService,
    private readonly uploads: MetaUploadService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, wabaId?: string) {
    const rows = await this.prisma.phoneNumber.findMany({
      where: { organizationId, ...(wabaId ? { wabaId } : {}) },
      include,
      orderBy: [{ createdAt: 'asc' }],
    });
    return rows.map((r) => this.toDto(r));
  }

  async get(organizationId: string, id: string) {
    const row = await this.prisma.phoneNumber.findFirst({ where: { id, organizationId }, include });
    if (!row) throw notFound('Phone number');
    return this.toDto(row);
  }

  async updateLabel(organizationId: string, id: string, displayLabel: string | null) {
    const result = await this.prisma.phoneNumber.updateMany({
      where: { id, organizationId },
      data: { displayLabel },
    });
    if (result.count === 0) throw notFound('Phone number');
    return this.get(organizationId, id);
  }

  /** Adds the number to the WABA at Meta, then stores it. Verification and registration follow. */
  async add(organizationId: string, input: AddPhoneDto) {
    const { waba, credentials } = await this.credentials.forWaba(organizationId, input.wabaId);
    this.credentials.requireScope(credentials, 'whatsapp_business_management');
    const created = await this.metaPhones.add(waba.metaWabaId, credentials.token, input);
    const node = await this.metaPhones.get(created.id, credentials.token).catch(() => ({ id: created.id }));
    const row = await this.prisma.phoneNumber.upsert({
      where: { organizationId_metaPhoneNumberId: { organizationId, metaPhoneNumberId: created.id } },
      create: { organizationId, wabaId: waba.id, metaPhoneNumberId: created.id, ...phoneDataFromMeta(node) },
      update: phoneDataFromMeta(node),
      include,
    });
    await this.audit.record({
      organizationId,
      action: 'PHONE_ADDED',
      resource: 'phone_number',
      resourceId: row.id,
      metadata: { metaPhoneNumberId: created.id, cc: input.cc, verifiedName: input.verifiedName },
    });
    return this.toDto(row);
  }

  async requestCode(organizationId: string, id: string, input: RequestCodeDto) {
    const { phone, credentials } = await this.credentials.forPhone(organizationId, id);
    await this.metaPhones.requestCode(
      phone.metaPhoneNumberId,
      credentials.token,
      input.method,
      input.language,
    );
    await this.audit.record({
      organizationId,
      action: 'PHONE_CODE_REQUESTED',
      resource: 'phone_number',
      resourceId: id,
      metadata: { method: input.method },
    });
  }

  async verifyCode(organizationId: string, id: string, code: string) {
    const { phone, credentials } = await this.credentials.forPhone(organizationId, id);
    await this.metaPhones.verifyCode(phone.metaPhoneNumberId, credentials.token, code);
    await this.audit.record({
      organizationId,
      action: 'PHONE_CODE_VERIFIED',
      resource: 'phone_number',
      resourceId: id,
    });
    return this.refresh(organizationId, id);
  }

  async register(organizationId: string, id: string, input: RegisterPhoneDto) {
    const { phone, credentials } = await this.credentials.forPhone(organizationId, id);
    this.credentials.requireScope(credentials, 'whatsapp_business_messaging');
    await this.metaPhones.register(
      phone.metaPhoneNumberId,
      credentials.token,
      input.pin,
      input.dataLocalizationRegion,
    );
    await this.audit.record({
      organizationId,
      action: 'PHONE_REGISTERED',
      resource: 'phone_number',
      resourceId: id,
      metadata: {
        metaPhoneNumberId: phone.metaPhoneNumberId,
        dataLocalizationRegion: input.dataLocalizationRegion,
      },
    });
    return this.refresh(organizationId, id);
  }

  async deregister(organizationId: string, id: string) {
    const { phone, credentials } = await this.credentials.forPhone(organizationId, id);
    await this.metaPhones.deregister(phone.metaPhoneNumberId, credentials.token);
    await this.audit.record({
      organizationId,
      action: 'PHONE_DEREGISTERED',
      resource: 'phone_number',
      resourceId: id,
      metadata: { metaPhoneNumberId: phone.metaPhoneNumberId },
    });
    return this.refresh(organizationId, id);
  }

  async setTwoStepPin(organizationId: string, id: string, pin: string) {
    const { phone, credentials } = await this.credentials.forPhone(organizationId, id);
    await this.metaPhones.setTwoStepPin(phone.metaPhoneNumberId, credentials.token, pin);
    await this.audit.record({
      organizationId,
      action: 'PHONE_PIN_CHANGED',
      resource: 'phone_number',
      resourceId: id,
    });
  }

  /** Re-reads the number from Meta. */
  async refresh(organizationId: string, id: string) {
    const { phone, credentials } = await this.credentials.forPhone(organizationId, id);
    const node = await this.metaPhones.get(phone.metaPhoneNumberId, credentials.token);
    const row = await this.prisma.phoneNumber.update({
      where: { id },
      data: phoneDataFromMeta(node),
      include,
    });
    return this.toDto(row);
  }

  async getBusinessProfile(organizationId: string, id: string) {
    const { phone, credentials } = await this.credentials.forPhone(organizationId, id);
    try {
      const profile = await this.metaPhones.getBusinessProfile(phone.metaPhoneNumberId, credentials.token);
      const data = {
        about: profile.about ?? null,
        address: profile.address ?? null,
        description: profile.description ?? null,
        email: profile.email ?? null,
        vertical: profile.vertical || null,
        websites: profile.websites ?? [],
        profilePictureUrl: profile.profile_picture_url ?? null,
        lastSyncedAt: new Date(),
      };
      const saved = await this.prisma.businessProfile.upsert({
        where: { phoneNumberId: id },
        create: { phoneNumberId: id, ...data },
        update: data,
      });
      return { ...this.profileDto(saved), stale: false };
    } catch (error) {
      const cached = await this.prisma.businessProfile.findUnique({ where: { phoneNumberId: id } });
      if (!cached || !(error instanceof MetaApiError) || !error.isTransient) throw error;
      this.logger.warn(`Serving cached business profile for ${id}: ${error.message}`);
      return { ...this.profileDto(cached), stale: true };
    }
  }

  async updateBusinessProfile(organizationId: string, id: string, input: UpdateBusinessProfileDto) {
    const { phone, credentials } = await this.credentials.forPhone(organizationId, id);
    await this.metaPhones.updateBusinessProfile(phone.metaPhoneNumberId, credentials.token, input);
    await this.audit.record({
      organizationId,
      action: 'BUSINESS_PROFILE_UPDATED',
      resource: 'phone_number',
      resourceId: id,
      metadata: { fields: Object.keys(input) },
    });
    return this.getBusinessProfile(organizationId, id);
  }

  async updateProfilePhoto(organizationId: string, id: string, file?: Express.Multer.File) {
    if (!file) throw badRequest('Attach an image file.');
    if (
      !['image/jpeg', 'image/png'].includes(file.mimetype) ||
      !RESUMABLE_UPLOAD_TYPES.includes(file.mimetype)
    ) {
      throw badRequest('Profile photos must be JPEG or PNG.');
    }
    const { phone, credentials } = await this.credentials.forPhone(organizationId, id);
    const handle = await this.uploads.upload(credentials.appId, credentials.token, {
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
    });
    await this.metaPhones.updateBusinessProfile(phone.metaPhoneNumberId, credentials.token, {
      profile_picture_handle: handle,
    });
    await this.audit.record({
      organizationId,
      action: 'BUSINESS_PROFILE_UPDATED',
      resource: 'phone_number',
      resourceId: id,
      metadata: { fields: ['profile_picture'] },
    });
    return this.getBusinessProfile(organizationId, id);
  }

  private profileDto(p: Prisma.BusinessProfileGetPayload<object>) {
    return {
      about: p.about,
      address: p.address,
      description: p.description,
      email: p.email,
      vertical: p.vertical,
      websites: p.websites,
      profilePictureUrl: p.profilePictureUrl,
      lastSyncedAt: isoOrNull(p.lastSyncedAt),
    };
  }

  toDto(r: PhoneRow) {
    const raw = (r.raw ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      metaPhoneNumberId: r.metaPhoneNumberId,
      waba: r.waba,
      displayPhoneNumber: r.displayPhoneNumber,
      verifiedName: r.verifiedName,
      displayLabel: r.displayLabel,
      status: r.status,
      codeVerificationStatus: r.codeVerificationStatus,
      nameStatus: r.nameStatus,
      qualityRating: r.qualityRating,
      platformType: r.platformType,
      throughputLevel: r.throughputLevel,
      messagingLimitTier: r.messagingLimitTier,
      isOfficialBusinessAccount: r.isOfficialBusinessAccount,
      accountMode: typeof raw.account_mode === 'string' ? raw.account_mode : null,
      lastOnboardedTime: isoOrNull(r.lastOnboardedTime),
      lastSyncedAt: isoOrNull(r.lastSyncedAt),
      createdAt: iso(r.createdAt),
    };
  }
}
