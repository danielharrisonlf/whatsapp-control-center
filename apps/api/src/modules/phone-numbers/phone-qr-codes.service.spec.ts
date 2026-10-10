import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service';
import type { MetaCredentialsService } from '../connections/meta-credentials.service';
import type { MetaGraphClient } from '../meta/meta-graph.client';
import { MetaQrCodeService } from '../meta/meta-qr-code.service';
import { CreatePhoneQrCodeDto, QrCodeParamsDto, UpdatePhoneQrCodeDto } from './phone-qr-codes.dto';
import { PhoneQrCodesService } from './phone-qr-codes.service';

const qr = { code: 'QR_1', prefilled_message: 'Hello', deep_link_url: 'https://wa.me/1' };

describe('MetaQrCodeService', () => {
  const graph = { collect: vi.fn(), get: vi.fn(), post: vi.fn(), delete: vi.fn() };
  const service = new MetaQrCodeService(graph as unknown as MetaGraphClient);
  beforeEach(() => vi.resetAllMocks());

  it('reads the bounded collection and retrieves a code through the Graph data wrapper', async () => {
    graph.collect.mockResolvedValue({ items: [qr], truncated: false });
    graph.get.mockResolvedValue({ data: [qr] });
    await expect(service.list('phone', 'token')).resolves.toEqual({ items: [qr], truncated: false });
    await expect(service.get('phone', 'token', 'QR_1')).resolves.toEqual({ data: [qr] });
    expect(graph.collect).toHaveBeenCalledWith(
      '/phone/message_qrdls',
      'token',
      {
        fields: 'code,prefilled_message,deep_link_url,qr_image_url.format(PNG)',
      },
      { maxItems: 2000 },
    );
    expect(graph.get).toHaveBeenCalledWith(
      '/phone/message_qrdls/QR_1',
      'token',
      expect.objectContaining({ fields: expect.any(String) }),
    );
  });

  it('uses the documented collection path and bodies for create and update', async () => {
    graph.post.mockResolvedValue(qr);
    await service.create('phone', 'token', 'Hello', 'SVG');
    await service.update('phone', 'token', 'QR_1', 'Updated');
    expect(graph.post).toHaveBeenNthCalledWith(
      1,
      '/phone/message_qrdls',
      'token',
      {
        prefilled_message: 'Hello',
        generate_qr_image: 'SVG',
      },
      { retry: 'never' },
    );
    expect(graph.post).toHaveBeenNthCalledWith(
      2,
      '/phone/message_qrdls',
      'token',
      {
        code: 'QR_1',
        prefilled_message: 'Updated',
      },
      { retry: 'idempotent' },
    );
  });

  it('encodes a code path segment and never retries deletion', async () => {
    graph.delete.mockResolvedValue({ success: true });
    await service.delete('phone', 'token', '../escape');
    expect(graph.delete).toHaveBeenCalledWith('/phone/message_qrdls/..%2Fescape', 'token', undefined, {
      retry: 'never',
    });
  });
});

describe('QR input validation', () => {
  it('rejects traversal and oversized codes', () => {
    const base = {
      organizationId: '4ead4f9e-67c0-49f2-a51e-1cbaad089a61',
      phoneId: '223c754b-5bf0-4fef-b8d3-9c2f62e2f826',
    };
    expect(QrCodeParamsDto.schema.safeParse({ ...base, code: 'a_B-1' }).success).toBe(true);
    for (const code of ['../escape', 'a/b', 'a%2Fb', 'x'.repeat(129)]) {
      expect(QrCodeParamsDto.schema.safeParse({ ...base, code }).success).toBe(false);
    }
  });

  it('enforces message length and defaults to PNG', () => {
    expect(CreatePhoneQrCodeDto.schema.parse({ prefilledMessage: ' Hello ' })).toEqual({
      prefilledMessage: 'Hello',
      imageFormat: 'PNG',
    });
    expect(CreatePhoneQrCodeDto.schema.safeParse({ prefilledMessage: 'x'.repeat(141) }).success).toBe(false);
    expect(UpdatePhoneQrCodeDto.schema.safeParse({ prefilledMessage: ' ' }).success).toBe(false);
  });
});

describe('PhoneQrCodesService', () => {
  const credentials = { forPhone: vi.fn(), requireScope: vi.fn() };
  const meta = { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const audit = { record: vi.fn() };
  const service = new PhoneQrCodesService(
    credentials as unknown as MetaCredentialsService,
    meta as unknown as MetaQrCodeService,
    audit as unknown as AuditService,
  );
  beforeEach(() => {
    vi.resetAllMocks();
    credentials.forPhone.mockResolvedValue({
      phone: { metaPhoneNumberId: 'meta-phone' },
      credentials: { token: 'secret' },
    });
  });

  it('requires an owned phone and management scope before calling Meta', async () => {
    credentials.forPhone.mockRejectedValueOnce(new Error('not owned'));
    await expect(service.list('other-org', 'phone-id')).rejects.toThrow('not owned');
    credentials.requireScope.mockImplementationOnce(() => {
      throw new Error('missing scope');
    });
    await expect(service.list('org', 'phone-id')).rejects.toThrow('missing scope');
    expect(meta.list).not.toHaveBeenCalled();
    expect(credentials.forPhone).toHaveBeenCalledWith('org', 'phone-id');
    expect(credentials.requireScope).toHaveBeenCalledWith(
      { token: 'secret' },
      'whatsapp_business_management',
    );
  });

  it('maps QR fields and rejects a truncated collection', async () => {
    meta.list.mockResolvedValueOnce({ items: [qr], truncated: false });
    meta.list.mockResolvedValueOnce({ items: [qr], truncated: true });
    await expect(service.list('org', 'phone-id')).resolves.toEqual([
      {
        code: 'QR_1',
        prefilledMessage: 'Hello',
        deepLinkUrl: 'https://wa.me/1',
        qrImageUrl: null,
      },
    ]);
    await expect(service.list('org', 'phone-id')).rejects.toThrow('retrieval limit');
  });

  it('selects the matching QR from Meta data and rejects a missing code', async () => {
    meta.get.mockResolvedValue({ data: [{ ...qr, code: 'other' }, qr] });
    await expect(service.get('org', 'phone-id', 'QR_1')).resolves.toMatchObject({ code: 'QR_1' });
    await expect(service.get('org', 'phone-id', 'missing')).rejects.toThrow();
    expect(meta.get).toHaveBeenCalledWith('meta-phone', 'secret', 'QR_1');
  });

  it('audits create and update and requires Meta confirmation before auditing delete', async () => {
    meta.create.mockResolvedValue(qr);
    meta.update.mockResolvedValue(qr);
    meta.delete.mockResolvedValueOnce({ success: false }).mockResolvedValueOnce({ success: true });
    await service.create('org', 'phone-id', { prefilledMessage: 'Hello', imageFormat: 'PNG' });
    await service.update('org', 'phone-id', 'QR_1', 'Updated');
    await expect(service.delete('org', 'phone-id', 'QR_1')).rejects.toThrow('did not confirm');
    expect(audit.record).toHaveBeenCalledTimes(2);
    await expect(service.delete('org', 'phone-id', 'QR_1')).resolves.toEqual({ success: true });
    expect(audit.record).toHaveBeenCalledTimes(3);
    expect(meta.create).toHaveBeenCalledWith('meta-phone', 'secret', 'Hello', 'PNG');
    expect(meta.update).toHaveBeenCalledWith('meta-phone', 'secret', 'QR_1', 'Updated');
    expect(meta.delete).toHaveBeenCalledWith('meta-phone', 'secret', 'QR_1');
    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({ organizationId: 'org', action: 'PHONE_QR_DELETED' }),
    );
  });
});
