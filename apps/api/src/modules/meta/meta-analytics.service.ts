import { Injectable } from '@nestjs/common';
import { MetaGraphClient } from './meta-graph.client';

export interface MessagingDataPoint {
  start: number;
  end: number;
  sent?: number;
  delivered?: number;
}

export interface PricingDataPoint {
  start: number;
  end: number;
  volume?: number;
  cost?: number;
  pricing_category?: string;
  pricing_type?: string;
  country?: string;
  phone_number?: string;
}

export interface TemplateAnalyticsDataPoint {
  template_id: string;
  start: number;
  end: number;
  sent?: number;
  delivered?: number;
  read?: number;
  clicked?: { type: string; button_content?: string; count: number }[];
  cost?: { type: string; value?: number }[];
}

/**
 * WABA analytics. Lookback is limited to 1 year (template analytics: 90 days).
 * https://developers.facebook.com/docs/whatsapp/business-management-api/analytics
 */
@Injectable()
export class MetaAnalyticsService {
  constructor(private readonly graph: MetaGraphClient) {}

  /** `analytics` field: sent/delivered counts. */
  async messaging(
    wabaId: string,
    token: string,
    input: {
      start: number;
      end: number;
      granularity: 'HALF_HOUR' | 'DAY' | 'MONTH';
      phoneNumbers?: string[];
      countryCodes?: string[];
    },
  ) {
    const parts = [`start(${input.start})`, `end(${input.end})`, `granularity(${input.granularity})`];
    if (input.phoneNumbers?.length) parts.push(`phone_numbers(${JSON.stringify(input.phoneNumbers)})`);
    if (input.countryCodes?.length) parts.push(`country_codes(${JSON.stringify(input.countryCodes)})`);
    const res = await this.graph.get<{ analytics?: { data_points?: MessagingDataPoint[] } }>(
      `/${wabaId}`,
      token,
      {
        fields: `analytics.${parts.join('.')}`,
      },
    );
    return res.analytics?.data_points ?? [];
  }

  /** `pricing_analytics` field (per-message pricing, since 2025-07-01). */
  async pricing(
    wabaId: string,
    token: string,
    input: {
      start: number;
      end: number;
      granularity: 'HALF_HOUR' | 'DAILY' | 'MONTHLY';
      phoneNumbers?: string[];
      countryCodes?: string[];
      dimensions?: string[];
    },
  ) {
    const parts = [`start(${input.start})`, `end(${input.end})`, `granularity(${input.granularity})`];
    if (input.phoneNumbers?.length) parts.push(`phone_numbers(${JSON.stringify(input.phoneNumbers)})`);
    if (input.countryCodes?.length) parts.push(`country_codes(${JSON.stringify(input.countryCodes)})`);
    parts.push(`dimensions(${JSON.stringify(input.dimensions ?? ['PRICING_CATEGORY'])})`);
    const res = await this.graph.get<{
      pricing_analytics?: { data?: { data_points?: PricingDataPoint[] }[] };
    }>(`/${wabaId}`, token, {
      fields: `pricing_analytics.${parts.join('.')}`,
    });
    return (res.pricing_analytics?.data ?? []).flatMap((d) => d.data_points ?? []);
  }

  /** Requires `is_enabled_for_insights`. Up to 10 templates, DAILY granularity, 90-day lookback. */
  async templates(
    wabaId: string,
    token: string,
    input: { start: number; end: number; templateIds: string[] },
  ) {
    const res = await this.graph.get<{ data?: { data_points?: TemplateAnalyticsDataPoint[] }[] }>(
      `/${wabaId}/template_analytics`,
      token,
      {
        start: input.start,
        end: input.end,
        granularity: 'DAILY',
        template_ids: input.templateIds.slice(0, 10),
        metric_types: ['SENT', 'DELIVERED', 'READ', 'CLICKED'],
      },
    );
    return (res.data ?? []).flatMap((d) => d.data_points ?? []);
  }
}
