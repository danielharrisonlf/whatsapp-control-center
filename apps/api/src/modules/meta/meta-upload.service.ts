import { Injectable } from '@nestjs/common';
import { MetaGraphClient } from './meta-graph.client';

export const RESUMABLE_UPLOAD_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'video/mp4',
];

/**
 * Resumable Upload API: produces the file handle used by template media headers
 * (`example.header_handle`) and business profile pictures (`profile_picture_handle`).
 * https://developers.facebook.com/docs/graph-api/guides/upload
 */
@Injectable()
export class MetaUploadService {
  constructor(private readonly graph: MetaGraphClient) {}

  async upload(appId: string, token: string, file: { buffer: Buffer; fileName: string; mimeType: string }) {
    const session = await this.graph.post<{ id: string }>(`/${appId}/uploads`, token, undefined, {
      query: { file_name: file.fileName, file_length: file.buffer.length, file_type: file.mimeType },
      retry: 'never',
    });
    const result = await this.graph.request<{ h: string }>({
      method: 'POST',
      path: `/${session.id}`,
      token,
      authScheme: 'OAuth',
      binary: {
        data: file.buffer,
        headers: { file_offset: '0', 'Content-Type': 'application/octet-stream' },
      },
      retry: 'never',
      timeoutMs: 120_000,
    });
    return result.data.h;
  }
}
