import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service';
import type { MetaCredentialsService } from '../connections/meta-credentials.service';
import type { MetaPhoneSettingsService } from '../meta/meta-phone-settings.service';
import {
  BlockedUsersQueryDto,
  ChangeBlockedUsersDto,
  SetPhoneEncryptionDto,
  UpdatePhoneCommerceSettingsDto,
} from './phone-settings.dto';
import { PhoneSettingsService } from './phone-settings.service';

describe('phone settings input', () => {
  it('accepts a 2048-bit RSA public PEM and rejects private, malformed and weak keys', () => {
    const strong = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const weak = generateKeyPairSync('rsa', {
      modulusLength: 1024,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    expect(SetPhoneEncryptionDto.schema.safeParse({ businessPublicKey: strong.publicKey }).success).toBe(
      true,
    );
    for (const key of [strong.privateKey, weak.publicKey, 'not a PEM']) {
      expect(SetPhoneEncryptionDto.schema.safeParse({ businessPublicKey: key }).success).toBe(false);
    }
  });

  it('preserves false updates and requires at least one commerce setting', () => {
    expect(UpdatePhoneCommerceSettingsDto.schema.parse({ isCartEnabled: false })).toEqual({
      isCartEnabled: false,
    });
    expect(UpdatePhoneCommerceSettingsDto.schema.safeParse({}).success).toBe(false);
  });

  it('validates pagination bounds and duplicate block targets', () => {
    expect(BlockedUsersQueryDto.schema.parse({})).toEqual({ limit: 25 });
    expect(BlockedUsersQueryDto.schema.parse({ after: 'cursor', limit: '100' })).toEqual({
      after: 'cursor',
      limit: 100,
    });
    expect(BlockedUsersQueryDto.schema.safeParse({ limit: 101 }).success).toBe(false);
    expect(
      ChangeBlockedUsersDto.schema.safeParse({ users: ['+5511999999999', '5511999999999'] }).success,
    ).toBe(false);
  });
});

describe('PhoneSettingsService', () => {
  const context = { phone: { metaPhoneNumberId: 'meta-phone' }, credentials: { token: 'secret' } };
  const credentials = { forPhone: vi.fn(), requireScope: vi.fn() };
  const meta = {
    commerce: vi.fn(),
    updateCommerce: vi.fn(),
    encryption: vi.fn(),
    setEncryption: vi.fn(),
    blockedUsers: vi.fn(),
    changeBlockedUsers: vi.fn(),
  };
  const audit = { record: vi.fn() };
  const service = new PhoneSettingsService(
    credentials as unknown as MetaCredentialsService,
    meta as unknown as MetaPhoneSettingsService,
    audit as unknown as AuditService,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    credentials.forPhone.mockResolvedValue(context);
    audit.record.mockResolvedValue(undefined);
  });

  it('preserves false updates, checks the organization context and reads back commerce settings', async () => {
    meta.updateCommerce.mockResolvedValue({ success: true });
    meta.commerce.mockResolvedValue({ data: [{ is_cart_enabled: false, is_catalog_visible: true }] });
    await expect(service.updateCommerce('org-1', 'local-phone', { isCartEnabled: false })).resolves.toEqual({
      isCartEnabled: false,
      isCatalogVisible: true,
    });
    expect(credentials.forPhone).toHaveBeenCalledWith('org-1', 'local-phone');
    expect(credentials.requireScope).toHaveBeenCalledWith(
      context.credentials,
      'whatsapp_business_management',
    );
    expect(meta.updateCommerce).toHaveBeenCalledWith('meta-phone', 'secret', { is_cart_enabled: false });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', resourceId: 'local-phone' }),
    );
  });

  it('does not call Meta when organization lookup or required scope fails', async () => {
    credentials.forPhone.mockRejectedValueOnce(new Error('phone not owned by organization'));
    await expect(service.commerce('other-org', 'local-phone')).rejects.toThrow('not owned');
    credentials.requireScope.mockImplementationOnce(() => {
      throw new Error('missing scope');
    });
    await expect(service.encryption('org-1', 'local-phone')).rejects.toThrow('missing scope');
    expect(meta.commerce).not.toHaveBeenCalled();
    expect(meta.encryption).not.toHaveBeenCalled();
    expect(credentials.requireScope).toHaveBeenCalledWith(context.credentials, 'whatsapp_business_messaging');
  });

  it('returns only a real next cursor from the blocked users page', async () => {
    meta.blockedUsers.mockResolvedValueOnce({
      data: [{ wa_id: '5511' }],
      paging: { cursors: { after: 'cursor-2' }, next: 'url' },
    });
    meta.blockedUsers.mockResolvedValueOnce({ data: [], paging: { cursors: { after: 'stale' } } });
    await expect(service.blockedUsers('org-1', 'local-phone', { limit: 10 })).resolves.toEqual({
      items: [{ waId: '5511' }],
      nextCursor: 'cursor-2',
    });
    await expect(
      service.blockedUsers('org-1', 'local-phone', { limit: 10, after: 'cursor-2' }),
    ).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(meta.blockedUsers).toHaveBeenCalledWith('meta-phone', 'secret', { limit: 10, after: 'cursor-2' });
    expect(credentials.requireScope).toHaveBeenCalledWith(context.credentials, 'whatsapp_business_messaging');
  });

  it('exposes partial block failures and audits the actual result counts', async () => {
    const failed = [{ input: 'bad', error: { code: 100 } }];
    meta.changeBlockedUsers.mockResolvedValue({
      block_users: { added_users: [{ input: '5511', wa_id: '5511' }], failed_users: failed },
    });
    await expect(service.changeBlockedUsers('org-1', 'local-phone', ['5511', 'bad'], false)).resolves.toEqual(
      {
        successful: [{ input: '5511', waId: '5511' }],
        failed,
      },
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHONE_USERS_BLOCKED',
        metadata: { successful: 1, failed: 1 },
      }),
    );
  });

  it('reports every requested number omitted from a partial Meta response', async () => {
    meta.changeBlockedUsers.mockResolvedValue({
      block_users: { added_users: [{ input: '5511', wa_id: '5511' }] },
    });
    await expect(
      service.changeBlockedUsers('org-1', 'local-phone', ['5511', '5522'], false),
    ).resolves.toEqual({
      successful: [{ input: '5511', waId: '5511' }],
      failed: [{ input: '5522', message: 'Meta did not confirm the operation for this number.' }],
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { successful: 1, failed: 1 } }),
    );
  });

  it('rejects empty block results and audits unblocking separately', async () => {
    meta.changeBlockedUsers.mockResolvedValueOnce({ block_users: {} });
    await expect(service.changeBlockedUsers('org-1', 'local-phone', ['5511'], false)).rejects.toThrow(
      'no block operation results',
    );
    expect(audit.record).not.toHaveBeenCalled();
    meta.changeBlockedUsers.mockResolvedValueOnce({ block_users: { removed_users: [{ input: '5511' }] } });
    await expect(service.changeBlockedUsers('org-1', 'local-phone', ['5511'], true)).resolves.toEqual({
      successful: [{ input: '5511', waId: null }],
      failed: [],
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'PHONE_USERS_UNBLOCKED' }));
  });
});
