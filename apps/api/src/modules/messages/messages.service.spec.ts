import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MetaCredentialsService } from '../connections/meta-credentials.service';
import type { MetaGraphClient } from '../meta/meta-graph.client';
import type { MetaMessageService } from '../meta/meta-message.service';
import { MessagesService } from './messages.service';

describe('MessagesService.markAsRead', () => {
  const prisma = { message: { findFirst: vi.fn(), update: vi.fn() } };
  const credentials = { forPhone: vi.fn(), requireScope: vi.fn() };
  const metaMessages = { markAsRead: vi.fn() };
  const service = new MessagesService(
    prisma as unknown as PrismaService,
    credentials as unknown as MetaCredentialsService,
    metaMessages as unknown as MetaMessageService,
    {} as MetaGraphClient,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.message.findFirst.mockResolvedValue({
      id: 'message-1',
      phoneNumberId: 'local-phone',
      wamid: 'wamid-1',
    });
    credentials.forPhone.mockResolvedValue({
      phone: { metaPhoneNumberId: 'meta-phone' },
      credentials: { token: 'secret' },
    });
    metaMessages.markAsRead.mockResolvedValue({ success: true });
    prisma.message.update.mockResolvedValue({});
  });

  it('delegates typing only for an owned inbound message after checking messaging scope', async () => {
    await service.markAsRead('org-1', 'message-1', true);
    expect(prisma.message.findFirst).toHaveBeenCalledWith({
      where: { id: 'message-1', organizationId: 'org-1', direction: 'INBOUND' },
    });
    expect(credentials.forPhone).toHaveBeenCalledWith('org-1', 'local-phone');
    expect(credentials.requireScope).toHaveBeenCalledWith({ token: 'secret' }, 'whatsapp_business_messaging');
    expect(metaMessages.markAsRead).toHaveBeenCalledWith('meta-phone', 'secret', 'wamid-1', true);
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'message-1' },
      data: { status: 'read' },
    });
  });

  it('does not call Meta or write when no inbound wamid is found', async () => {
    prisma.message.findFirst.mockResolvedValueOnce(null);
    await expect(service.markAsRead('org-1', 'outbound-message', true)).rejects.toThrow();
    expect(credentials.forPhone).not.toHaveBeenCalled();
    expect(metaMessages.markAsRead).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it('does not mark the local message read if Meta rejects typing/read', async () => {
    metaMessages.markAsRead.mockRejectedValueOnce(new Error('Meta rejected request'));
    await expect(service.markAsRead('org-1', 'message-1', true)).rejects.toThrow('Meta rejected request');
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it('requires an explicit success response before marking the local message read', async () => {
    metaMessages.markAsRead.mockResolvedValueOnce({ success: false });
    await expect(service.markAsRead('org-1', 'message-1', true)).rejects.toThrow('did not confirm');
    expect(prisma.message.update).not.toHaveBeenCalled();
  });
});
