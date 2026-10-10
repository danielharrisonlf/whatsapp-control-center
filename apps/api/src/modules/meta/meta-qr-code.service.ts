import { Injectable } from '@nestjs/common';
import { MetaGraphClient } from './meta-graph.client';

export interface MetaQrCode {
  code: string;
  prefilled_message: string;
  deep_link_url: string;
  qr_image_url?: string;
}

const fields = 'code,prefilled_message,deep_link_url,qr_image_url.format(PNG)';

/** https://developers.facebook.com/docs/whatsapp/business-management-api/qr-codes */
@Injectable()
export class MetaQrCodeService {
  constructor(private readonly graph: MetaGraphClient) {}

  list(phoneId: string, token: string) {
    return this.graph.collect<MetaQrCode>(`/${phoneId}/message_qrdls`, token, { fields }, { maxItems: 2000 });
  }

  get(phoneId: string, token: string, code: string) {
    return this.graph.get<{ data: MetaQrCode[] }>(
      `/${phoneId}/message_qrdls/${encodeURIComponent(code)}`,
      token,
      { fields },
    );
  }

  create(phoneId: string, token: string, message: string, imageFormat: 'PNG' | 'SVG') {
    return this.graph.post<MetaQrCode>(
      `/${phoneId}/message_qrdls`,
      token,
      { prefilled_message: message, generate_qr_image: imageFormat },
      { retry: 'never' },
    );
  }

  update(phoneId: string, token: string, code: string, message: string) {
    return this.graph.post<MetaQrCode>(
      `/${phoneId}/message_qrdls`,
      token,
      { code, prefilled_message: message },
      { retry: 'idempotent' },
    );
  }

  delete(phoneId: string, token: string, code: string) {
    return this.graph.delete<{ success: boolean }>(
      `/${phoneId}/message_qrdls/${encodeURIComponent(code)}`,
      token,
      undefined,
      { retry: 'never' },
    );
  }
}
