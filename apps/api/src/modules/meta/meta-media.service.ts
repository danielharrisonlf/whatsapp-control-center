import { Injectable } from '@nestjs/common';
import { MetaGraphClient } from './meta-graph.client';

export interface MetaMediaNode {
  id: string;
  url: string;
  mime_type: string;
  sha256: string;
  file_size: number;
  messaging_product: 'whatsapp';
}

/**
 * Cloud API media. Download URLs expire after 5 minutes and media IDs after 7 days.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
 */
@Injectable()
export class MetaMediaService {
  constructor(private readonly graph: MetaGraphClient) {}

  upload(phoneNumberId: string, token: string, file: { buffer: Buffer; fileName: string; mimeType: string }) {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', file.mimeType);
    form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }), file.fileName);
    return this.graph.post<{ id: string }>(`/${phoneNumberId}/media`, token, undefined, {
      form,
      retry: 'never',
      timeoutMs: 120_000,
    });
  }

  get(mediaId: string, token: string, phoneNumberId?: string) {
    return this.graph.get<MetaMediaNode>(`/${mediaId}`, token, { phone_number_id: phoneNumberId });
  }

  delete(mediaId: string, token: string, phoneNumberId?: string) {
    return this.graph.delete<{ success: boolean }>(`/${mediaId}`, token, { phone_number_id: phoneNumberId });
  }

  /** Resolves a fresh URL and downloads the binary. */
  async download(mediaId: string, token: string, phoneNumberId?: string) {
    const node = await this.get(mediaId, token, phoneNumberId);
    const file = await this.graph.download(node.url, token);
    return { ...file, node };
  }
}
