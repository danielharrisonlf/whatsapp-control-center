import { Injectable } from '@nestjs/common';
import { badRequest } from '../../common/errors';
import { sanitize } from '../../common/sanitize';
import { AuditService } from '../audit/audit.service';
import { MetaCredentialsService } from '../connections/meta-credentials.service';
import { MetaPhoneSettingsService } from '../meta/meta-phone-settings.service';
import type { UpdatePhoneCommerceSettingsDto } from './phone-settings.dto';

@Injectable()
export class PhoneSettingsService {
  constructor(
    private readonly credentials: MetaCredentialsService,
    private readonly meta: MetaPhoneSettingsService,
    private readonly audit: AuditService,
  ) {}

  private async context(organizationId: string, phoneId: string, scope: string) {
    const context = await this.credentials.forPhone(organizationId, phoneId);
    this.credentials.requireScope(context.credentials, scope);
    return context;
  }

  async commerce(organizationId: string, phoneId: string) {
    const { phone, credentials } = await this.context(
      organizationId,
      phoneId,
      'whatsapp_business_management',
    );
    const response = await this.meta.commerce(phone.metaPhoneNumberId, credentials.token);
    const settings = response.data[0];
    if (!settings) throw badRequest('Meta did not return commerce settings for this phone number.');
    return { isCartEnabled: settings.is_cart_enabled, isCatalogVisible: settings.is_catalog_visible };
  }

  async updateCommerce(organizationId: string, phoneId: string, input: UpdatePhoneCommerceSettingsDto) {
    const { phone, credentials } = await this.context(
      organizationId,
      phoneId,
      'whatsapp_business_management',
    );
    const response = await this.meta.updateCommerce(phone.metaPhoneNumberId, credentials.token, {
      ...(input.isCartEnabled !== undefined ? { is_cart_enabled: input.isCartEnabled } : {}),
      ...(input.isCatalogVisible !== undefined ? { is_catalog_visible: input.isCatalogVisible } : {}),
    });
    if (!response.success) throw badRequest('Meta did not confirm the commerce settings update.');
    await this.audit.record({
      organizationId,
      action: 'PHONE_COMMERCE_UPDATED',
      resource: 'phone_number',
      resourceId: phoneId,
      metadata: { fields: Object.keys(input) },
    });
    return this.commerce(organizationId, phoneId);
  }

  async encryption(organizationId: string, phoneId: string) {
    const { phone, credentials } = await this.context(organizationId, phoneId, 'whatsapp_business_messaging');
    const response = await this.meta.encryption(phone.metaPhoneNumberId, credentials.token);
    const settings = response.data[0];
    return {
      businessPublicKey: settings?.business_public_key ?? null,
      signatureStatus: settings?.business_public_key_signature_status ?? null,
    };
  }

  async setEncryption(organizationId: string, phoneId: string, publicKey: string) {
    const { phone, credentials } = await this.context(organizationId, phoneId, 'whatsapp_business_messaging');
    const response = await this.meta.setEncryption(phone.metaPhoneNumberId, credentials.token, publicKey);
    if (!response.success) throw badRequest('Meta did not confirm the public key update.');
    await this.audit.record({
      organizationId,
      action: 'PHONE_ENCRYPTION_UPDATED',
      resource: 'phone_number',
      resourceId: phoneId,
    });
    return this.encryption(organizationId, phoneId);
  }

  async blockedUsers(organizationId: string, phoneId: string, query: { after?: string; limit: number }) {
    const { phone, credentials } = await this.context(organizationId, phoneId, 'whatsapp_business_messaging');
    const response = await this.meta.blockedUsers(phone.metaPhoneNumberId, credentials.token, query);
    return {
      items: response.data.map((user) => ({ waId: user.wa_id })),
      nextCursor: response.paging?.next ? (response.paging.cursors?.after ?? null) : null,
    };
  }

  async changeBlockedUsers(organizationId: string, phoneId: string, users: string[], remove: boolean) {
    const { phone, credentials } = await this.context(organizationId, phoneId, 'whatsapp_business_messaging');
    const response = await this.meta.changeBlockedUsers(
      phone.metaPhoneNumberId,
      credentials.token,
      users,
      remove,
    );
    const result = response.block_users;
    const successful = (remove ? result?.removed_users : result?.added_users) ?? [];
    // Keep partial failures visible and never infer success from an HTTP 200 alone.
    const failed = [...(result?.failed_users ?? [])];
    if (successful.length === 0 && failed.length === 0)
      throw badRequest('Meta returned no block operation results.');
    const normalized = (value: string) => value.replace(/^\+/, '');
    const confirmed = new Set(successful.map((user) => normalized(user.input)));
    const rejected = new Set(
      failed.flatMap((failure) => {
        if (!failure || typeof failure !== 'object') return [];
        const entry = failure as Record<string, unknown>;
        const input = entry.input ?? entry.user;
        return typeof input === 'string' ? [normalized(input)] : [];
      }),
    );
    // An omitted number is not a successful mutation, even when another number succeeded.
    for (const user of users) {
      if (!confirmed.has(normalized(user)) && !rejected.has(normalized(user))) {
        failed.push({ input: user, message: 'Meta did not confirm the operation for this number.' });
      }
    }
    await this.audit.record({
      organizationId,
      action: remove ? 'PHONE_USERS_UNBLOCKED' : 'PHONE_USERS_BLOCKED',
      resource: 'phone_number',
      resourceId: phoneId,
      metadata: { successful: successful.length, failed: failed.length },
    });
    return {
      successful: successful.map((user) => ({ input: user.input, waId: user.wa_id ?? null })),
      failed: sanitize(failed),
    };
  }
}
