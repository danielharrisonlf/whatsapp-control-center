import { Injectable } from '@nestjs/common';
import { type GraphPage, MetaGraphClient } from './meta-graph.client';

export interface CommerceSettings {
  is_cart_enabled: boolean;
  is_catalog_visible: boolean;
}

export interface PhoneEncryption {
  business_public_key?: string;
  business_public_key_signature_status?: string;
}

export interface BlockUsersResult {
  block_users?: {
    added_users?: { input: string; wa_id?: string }[];
    removed_users?: { input: string; wa_id?: string }[];
    failed_users?: unknown[];
  };
}

/** Official Cloud API phone settings; all requests use the shared authenticated Graph client. */
@Injectable()
export class MetaPhoneSettingsService {
  constructor(private readonly graph: MetaGraphClient) {}

  commerce(phoneId: string, token: string) {
    return this.graph.get<{ data: CommerceSettings[] }>(`/${phoneId}/whatsapp_commerce_settings`, token);
  }

  updateCommerce(phoneId: string, token: string, settings: Partial<CommerceSettings>) {
    return this.graph.post<{ success: boolean }>(`/${phoneId}/whatsapp_commerce_settings`, token, undefined, {
      query: settings,
      retry: 'idempotent',
    });
  }

  encryption(phoneId: string, token: string) {
    return this.graph.get<{ data: PhoneEncryption[] }>(`/${phoneId}/whatsapp_business_encryption`, token);
  }

  setEncryption(phoneId: string, token: string, publicKey: string) {
    const form = new FormData();
    form.append('business_public_key', publicKey);
    return this.graph.post<{ success: boolean }>(
      `/${phoneId}/whatsapp_business_encryption`,
      token,
      undefined,
      {
        form,
        retry: 'never',
      },
    );
  }

  blockedUsers(phoneId: string, token: string, query: { after?: string; limit: number }) {
    return this.graph.get<GraphPage<{ wa_id: string }>>(`/${phoneId}/block_users`, token, query);
  }

  changeBlockedUsers(phoneId: string, token: string, users: string[], remove: boolean) {
    return this.graph
      .request<BlockUsersResult>({
        method: remove ? 'DELETE' : 'POST',
        path: `/${phoneId}/block_users`,
        token,
        body: { messaging_product: 'whatsapp', block_users: users.map((user) => ({ user })) },
        retry: 'never',
      })
      .then((response) => response.data);
  }
}
