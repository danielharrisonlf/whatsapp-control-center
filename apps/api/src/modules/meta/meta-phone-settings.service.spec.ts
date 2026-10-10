import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MetaGraphClient } from './meta-graph.client';
import { MetaPhoneSettingsService } from './meta-phone-settings.service';

describe('MetaPhoneSettingsService', () => {
  const graph = { get: vi.fn(), post: vi.fn(), request: vi.fn() };
  const service = new MetaPhoneSettingsService(graph as unknown as MetaGraphClient);

  beforeEach(() => vi.clearAllMocks());

  it('passes false commerce values in Graph query parameters', async () => {
    graph.post.mockResolvedValue({ success: true });
    await service.updateCommerce('phone-1', 'secret', {
      is_cart_enabled: false,
      is_catalog_visible: false,
    });
    expect(graph.post).toHaveBeenCalledWith('/phone-1/whatsapp_commerce_settings', 'secret', undefined, {
      query: { is_cart_enabled: false, is_catalog_visible: false },
      retry: 'idempotent',
    });
  });

  it('sends the public key in multipart form data without retrying', async () => {
    graph.post.mockResolvedValue({ success: true });
    await service.setEncryption('phone-1', 'secret', 'public-pem');
    const [path, token, body, options] = graph.post.mock.calls[0]!;
    expect(path).toBe('/phone-1/whatsapp_business_encryption');
    expect(token).toBe('secret');
    expect(body).toBeUndefined();
    expect(options.retry).toBe('never');
    expect(options.form).toBeInstanceOf(FormData);
    expect(options.form.get('business_public_key')).toBe('public-pem');
  });

  it('uses a JSON body for both block and unblock, with no automatic retry', async () => {
    graph.request.mockResolvedValue({ data: { block_users: { removed_users: [] } } });
    await service.changeBlockedUsers('phone-1', 'secret', ['5511999999999'], false);
    await service.changeBlockedUsers('phone-1', 'secret', ['5511999999999'], true);
    for (const [index, method] of ['POST', 'DELETE'].entries()) {
      expect(graph.request.mock.calls[index]![0]).toEqual({
        method,
        path: '/phone-1/block_users',
        token: 'secret',
        body: { messaging_product: 'whatsapp', block_users: [{ user: '5511999999999' }] },
        retry: 'never',
      });
    }
  });

  it('passes block-list cursor and page size to Graph', async () => {
    graph.get.mockResolvedValue({ data: [] });
    await service.blockedUsers('phone-1', 'secret', { after: 'next-1', limit: 30 });
    expect(graph.get).toHaveBeenCalledWith('/phone-1/block_users', 'secret', {
      after: 'next-1',
      limit: 30,
    });
  });
});
