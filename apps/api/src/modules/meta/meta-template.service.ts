import { Injectable } from '@nestjs/common';
import type { MetaTemplateComponent, MetaTemplateCreatePayload } from '@wacc/types';
import { MetaGraphClient } from './meta-graph.client';

export interface MetaTemplateNode {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  sub_category?: string;
  previous_category?: string;
  parameter_format?: string;
  components?: MetaTemplateComponent[];
  quality_score?: { score?: string; date?: number };
  rejected_reason?: string;
}

const TEMPLATE_FIELDS =
  'id,name,language,status,category,sub_category,previous_category,parameter_format,components,quality_score,rejected_reason';

/**
 * Message template management.
 * https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/message_templates
 */
@Injectable()
export class MetaTemplateService {
  constructor(private readonly graph: MetaGraphClient) {}

  listAll(wabaId: string, token: string) {
    return this.graph.collect<MetaTemplateNode>(
      `/${wabaId}/message_templates`,
      token,
      { fields: TEMPLATE_FIELDS },
      { maxItems: 6000 },
    );
  }

  get(templateId: string, token: string) {
    return this.graph.get<MetaTemplateNode>(`/${templateId}`, token, { fields: TEMPLATE_FIELDS });
  }

  create(wabaId: string, token: string, payload: MetaTemplateCreatePayload) {
    return this.graph.post<{ id: string; status: string; category: string }>(
      `/${wabaId}/message_templates`,
      token,
      payload,
      {
        retry: 'never',
      },
    );
  }

  /** Only APPROVED, REJECTED or PAUSED templates can be edited; name and language are fixed. */
  edit(
    templateId: string,
    token: string,
    input: { components?: MetaTemplateComponent[]; category?: string },
  ) {
    return this.graph.post<{ success: boolean }>(`/${templateId}`, token, input, { retry: 'never' });
  }

  /** With `hsmId`, deletes one language; otherwise every language with that name. */
  delete(wabaId: string, token: string, name: string, hsmId?: string) {
    return this.graph.delete<{ success: boolean }>(
      `/${wabaId}/message_templates`,
      token,
      { name, hsm_id: hsmId },
      { retry: 'never' },
    );
  }
}
