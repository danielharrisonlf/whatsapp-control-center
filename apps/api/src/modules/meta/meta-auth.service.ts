import { Injectable } from '@nestjs/common';
import { MetaGraphClient } from './meta-graph.client';

export interface DebugTokenData {
  app_id?: string;
  type?: string;
  application?: string;
  expires_at?: number;
  data_access_expires_at?: number;
  is_valid: boolean;
  issued_at?: number;
  scopes?: string[];
  granular_scopes?: { scope: string; target_ids?: string[] }[];
  user_id?: string;
  error?: { code?: number; message?: string; subcode?: number };
}

/**
 * Token operations.
 * - Code exchange: https://developers.facebook.com/docs/whatsapp/embedded-signup/implementation
 * - Token inspection: https://developers.facebook.com/docs/graph-api/reference/debug_token
 */
@Injectable()
export class MetaAuthService {
  constructor(private readonly graph: MetaGraphClient) {}

  /** Exchanges an Embedded Signup code (valid for ~30 seconds) for a business integration token. */
  exchangeCode(appId: string, appSecret: string, code: string) {
    return this.graph
      .request<{ access_token: string; token_type?: string; expires_in?: number }>({
        method: 'GET',
        path: '/oauth/access_token',
        query: { client_id: appId, client_secret: appSecret, code },
        retry: 'never',
      })
      .then((r) => r.data);
  }

  /** Inspects a token using the app access token (`app_id|app_secret`). */
  async debugToken(inputToken: string, appId: string, appSecret: string): Promise<DebugTokenData> {
    // Without the app secret, a token can still inspect itself.
    const accessToken = appSecret ? `${appId}|${appSecret}` : inputToken;
    const res = await this.graph.get<{ data: DebugTokenData }>('/debug_token', accessToken, {
      input_token: inputToken,
    });
    return res.data;
  }

  /** Reads the app name, also validating the app ID + secret pair. */
  getApp(appId: string, appSecret: string) {
    return this.graph.get<{ id: string; name?: string }>(`/${appId}`, `${appId}|${appSecret}`, {
      fields: 'id,name',
    });
  }
}
