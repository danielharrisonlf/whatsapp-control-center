import { Injectable } from '@nestjs/common';
import { MetaGraphClient } from './meta-graph.client';

export interface SubscribedApp {
  whatsapp_business_api_data?: { id?: string; name?: string; link?: string };
  override_callback_uri?: string;
}

/**
 * WABA webhook subscription.
 * https://developers.facebook.com/docs/whatsapp/embedded-signup/webhooks/override
 */
@Injectable()
export class MetaWabaService {
  constructor(private readonly graph: MetaGraphClient) {}

  listSubscribedApps(wabaId: string, token: string) {
    return this.graph
      .get<{ data: SubscribedApp[] }>(`/${wabaId}/subscribed_apps`, token)
      .then((r) => r.data ?? []);
  }

  /** Subscribes the app that owns `token`. Idempotent on Meta's side. */
  subscribeApp(wabaId: string, token: string, override?: { callbackUri: string; verifyToken: string }) {
    return this.graph.post<{ success: boolean }>(
      `/${wabaId}/subscribed_apps`,
      token,
      override
        ? { override_callback_uri: override.callbackUri, verify_token: override.verifyToken }
        : undefined,
      { retry: 'idempotent' },
    );
  }

  /** Documented in WhatsApp guides; the v26 Graph reference marks it unsupported. Errors are surfaced as-is. */
  unsubscribeApp(wabaId: string, token: string) {
    return this.graph.delete<{ success: boolean }>(`/${wabaId}/subscribed_apps`, token, undefined, {
      retry: 'never',
    });
  }

  /** Template analytics must be enabled before /template_analytics returns data. */
  enableInsights(wabaId: string, token: string) {
    return this.graph.post<{ success: boolean }>(`/${wabaId}`, token, undefined, {
      query: { is_enabled_for_insights: true },
      retry: 'idempotent',
    });
  }
}
