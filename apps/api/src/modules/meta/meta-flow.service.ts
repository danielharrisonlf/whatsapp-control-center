import { Injectable } from '@nestjs/common';
import { MetaGraphClient } from './meta-graph.client';

export interface FlowValidationError {
  error: string;
  error_type: string;
  message: string;
  line_start?: number;
  line_end?: number;
  column_start?: number;
  column_end?: number;
  pointers?: {
    line_start: number;
    line_end: number;
    column_start: number;
    column_end: number;
    path: string;
  }[];
}

export interface MetaFlowNode {
  id: string;
  name: string;
  status: string;
  categories?: string[];
  validation_errors?: FlowValidationError[];
  json_version?: string;
  data_api_version?: string;
  endpoint_uri?: string;
  preview?: { preview_url: string; expires_at: string };
}

const FLOW_FIELDS = 'id,name,status,categories,validation_errors,json_version,data_api_version,endpoint_uri';

/**
 * WhatsApp Flows management.
 * https://developers.facebook.com/docs/whatsapp/flows/reference/flowsapi
 */
@Injectable()
export class MetaFlowService {
  constructor(private readonly graph: MetaGraphClient) {}

  listAll(wabaId: string, token: string) {
    return this.graph.collect<MetaFlowNode>(
      `/${wabaId}/flows`,
      token,
      { fields: 'id,name,status,categories,validation_errors' },
      { maxItems: 1000 },
    );
  }

  get(flowId: string, token: string) {
    return this.graph.get<MetaFlowNode>(`/${flowId}`, token, { fields: FLOW_FIELDS });
  }

  /** Preview link valid for 30 days. */
  preview(flowId: string, token: string, invalidate = false) {
    return this.graph.get<MetaFlowNode>(`/${flowId}`, token, { fields: `preview.invalidate(${invalidate})` });
  }

  create(
    wabaId: string,
    token: string,
    input: {
      name: string;
      categories: string[];
      flowJson?: string;
      endpointUri?: string;
      cloneFlowId?: string;
    },
  ) {
    return this.graph.post<{ id: string; success?: boolean; validation_errors?: FlowValidationError[] }>(
      `/${wabaId}/flows`,
      token,
      {
        name: input.name,
        categories: input.categories,
        ...(input.flowJson ? { flow_json: input.flowJson } : {}),
        ...(input.endpointUri ? { endpoint_uri: input.endpointUri } : {}),
        ...(input.cloneFlowId ? { clone_flow_id: input.cloneFlowId } : {}),
      },
      { retry: 'never' },
    );
  }

  updateMetadata(
    flowId: string,
    token: string,
    input: { name?: string; categories?: string[]; endpointUri?: string },
  ) {
    return this.graph.post<{ success: boolean }>(
      `/${flowId}`,
      token,
      {
        ...(input.name ? { name: input.name } : {}),
        ...(input.categories ? { categories: input.categories } : {}),
        ...(input.endpointUri !== undefined ? { endpoint_uri: input.endpointUri } : {}),
      },
      { retry: 'idempotent' },
    );
  }

  uploadJson(flowId: string, token: string, flowJson: string) {
    const form = new FormData();
    form.append('name', 'flow.json');
    form.append('asset_type', 'FLOW_JSON');
    form.append('file', new Blob([flowJson], { type: 'application/json' }), 'flow.json');
    return this.graph.post<{ success: boolean; validation_errors?: FlowValidationError[] }>(
      `/${flowId}/assets`,
      token,
      undefined,
      {
        form,
        retry: 'idempotent',
      },
    );
  }

  async downloadJson(flowId: string, token: string): Promise<unknown | null> {
    const assets = await this.graph.get<{
      data: { name: string; asset_type: string; download_url: string }[];
    }>(`/${flowId}/assets`, token);
    const asset = assets.data?.find((a) => a.asset_type === 'FLOW_JSON');
    if (!asset) return null;
    const res = await fetch(asset.download_url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return res.json().catch(() => null);
  }

  publish(flowId: string, token: string) {
    return this.graph.post<{ success: boolean }>(`/${flowId}/publish`, token, undefined, { retry: 'never' });
  }

  deprecate(flowId: string, token: string) {
    return this.graph.post<{ success: boolean }>(`/${flowId}/deprecate`, token, undefined, {
      retry: 'never',
    });
  }

  /** Only DRAFT flows can be deleted. */
  delete(flowId: string, token: string) {
    return this.graph.delete<{ success: boolean }>(`/${flowId}`, token, undefined, { retry: 'never' });
  }
}
