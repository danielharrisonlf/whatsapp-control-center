import { Injectable } from '@nestjs/common';
import { badRequest, notFound } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { MetaCredentialsService } from '../connections/meta-credentials.service';
import { type MetaQrCode, MetaQrCodeService } from '../meta/meta-qr-code.service';
import type { CreatePhoneQrCodeDto } from './phone-qr-codes.dto';

@Injectable()
export class PhoneQrCodesService {
  constructor(
    private readonly credentials: MetaCredentialsService,
    private readonly meta: MetaQrCodeService,
    private readonly audit: AuditService,
  ) {}

  private async context(organizationId: string, id: string) {
    const context = await this.credentials.forPhone(organizationId, id);
    this.credentials.requireScope(context.credentials, 'whatsapp_business_management');
    return context;
  }

  async list(organizationId: string, id: string) {
    const { phone, credentials } = await this.context(organizationId, id);
    const result = await this.meta.list(phone.metaPhoneNumberId, credentials.token);
    if (result.truncated) throw badRequest('The QR code list exceeded the local retrieval limit.');
    return result.items.map((qr) => this.dto(qr));
  }

  async get(organizationId: string, id: string, code: string) {
    const { phone, credentials } = await this.context(organizationId, id);
    const result = await this.meta.get(phone.metaPhoneNumberId, credentials.token, code);
    const qr = result.data.find((item) => item.code === code);
    if (!qr) throw notFound('QR code');
    return this.dto(qr);
  }

  async create(organizationId: string, id: string, input: CreatePhoneQrCodeDto) {
    const { phone, credentials } = await this.context(organizationId, id);
    const qr = await this.meta.create(
      phone.metaPhoneNumberId,
      credentials.token,
      input.prefilledMessage,
      input.imageFormat,
    );
    await this.audit.record({
      organizationId,
      action: 'PHONE_QR_CREATED',
      resource: 'phone_number',
      resourceId: id,
    });
    return this.dto(qr);
  }

  async update(organizationId: string, id: string, code: string, message: string) {
    const { phone, credentials } = await this.context(organizationId, id);
    const qr = await this.meta.update(phone.metaPhoneNumberId, credentials.token, code, message);
    await this.audit.record({
      organizationId,
      action: 'PHONE_QR_UPDATED',
      resource: 'phone_number',
      resourceId: id,
    });
    return this.dto(qr);
  }

  async delete(organizationId: string, id: string, code: string) {
    const { phone, credentials } = await this.context(organizationId, id);
    const result = await this.meta.delete(phone.metaPhoneNumberId, credentials.token, code);
    if (!result.success) throw badRequest('Meta did not confirm QR code deletion.');
    await this.audit.record({
      organizationId,
      action: 'PHONE_QR_DELETED',
      resource: 'phone_number',
      resourceId: id,
    });
    return { success: true } as const;
  }

  private dto(qr: MetaQrCode) {
    return {
      code: qr.code,
      prefilledMessage: qr.prefilled_message,
      deepLinkUrl: qr.deep_link_url,
      qrImageUrl: qr.qr_image_url ?? null,
    };
  }
}
