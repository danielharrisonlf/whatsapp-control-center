import { Injectable } from '@nestjs/common';
import { MetaGraphClient, type MetaResponse } from './meta-graph.client';

export interface SendMessageResponse {
  messaging_product: 'whatsapp';
  contacts?: { input: string; wa_id?: string; user_id?: string }[];
  messages?: { id: string; message_status?: string }[];
}

/**
 * Cloud API messages.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */
@Injectable()
export class MetaMessageService {
  constructor(private readonly graph: MetaGraphClient) {}

  /**
   * Sends a message. Never retried automatically except when Meta rejected it with a rate limit
   * (the message was not accepted), so a timeout never produces duplicate messages.
   */
  send(
    phoneNumberId: string,
    token: string,
    payload: Record<string, unknown>,
  ): Promise<MetaResponse<SendMessageResponse>> {
    return this.graph.request<SendMessageResponse>({
      method: 'POST',
      path: `/${phoneNumberId}/messages`,
      token,
      body: { messaging_product: 'whatsapp', ...payload },
      retry: 'auto',
    });
  }

  markAsRead(phoneNumberId: string, token: string, wamid: string, typing = false) {
    return this.graph.post<{ success: boolean }>(
      `/${phoneNumberId}/messages`,
      token,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: wamid,
        ...(typing ? { typing_indicator: { type: 'text' } } : {}),
      },
      { retry: 'idempotent' },
    );
  }
}
