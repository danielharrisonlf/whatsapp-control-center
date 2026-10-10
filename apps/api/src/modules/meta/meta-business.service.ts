import { Injectable } from '@nestjs/common';
import { MetaGraphClient } from './meta-graph.client';

export interface MetaWabaNode {
  id: string;
  name?: string;
  timezone_id?: string;
  currency?: string;
  message_template_namespace?: string;
  account_review_status?: string;
  business_verification_status?: string;
  ownership_type?: string;
  status?: string;
  country?: string;
  is_enabled_for_insights?: boolean;
  owner_business_info?: { id?: string; name?: string };
  health_status?: unknown;
}

export interface MetaBusinessNode {
  id: string;
  name?: string;
  verification_status?: string;
}

export const WABA_FIELDS = [
  'id',
  'name',
  'timezone_id',
  'currency',
  'message_template_namespace',
  'account_review_status',
  'business_verification_status',
  'ownership_type',
  'status',
  'country',
  'is_enabled_for_insights',
  'owner_business_info',
  'health_status',
].join(',');

/**
 * Business portfolio and WABA discovery.
 * https://developers.facebook.com/docs/marketing-api/reference/business/owned_whatsapp_business_accounts/
 */
@Injectable()
export class MetaBusinessService {
  constructor(private readonly graph: MetaGraphClient) {}

  getBusiness(businessId: string, token: string) {
    return this.graph.get<MetaBusinessNode>(`/${businessId}`, token, {
      fields: 'id,name,verification_status',
    });
  }

  /** Businesses the token's user can access. Requires `business_management`. */
  listBusinesses(token: string) {
    return this.graph.collect<MetaBusinessNode>(
      '/me/businesses',
      token,
      { fields: 'id,name,verification_status' },
      { maxItems: 200 },
    );
  }

  listOwnedWabas(businessId: string, token: string) {
    return this.graph.collect<MetaWabaNode>(
      `/${businessId}/owned_whatsapp_business_accounts`,
      token,
      { fields: WABA_FIELDS },
      { maxItems: 500 },
    );
  }

  listClientWabas(businessId: string, token: string) {
    return this.graph.collect<MetaWabaNode>(
      `/${businessId}/client_whatsapp_business_accounts`,
      token,
      { fields: WABA_FIELDS },
      { maxItems: 500 },
    );
  }

  /**
   * `owner_business_info` is not in the current reference pages; if Meta rejects the field we
   * retry without it rather than failing the whole sync.
   */
  async getWaba(wabaId: string, token: string): Promise<MetaWabaNode> {
    try {
      return await this.graph.get<MetaWabaNode>(`/${wabaId}`, token, { fields: WABA_FIELDS });
    } catch (error) {
      const fallback = WABA_FIELDS.split(',').filter(
        (f) => f !== 'owner_business_info' && f !== 'health_status',
      );
      return this.graph.get<MetaWabaNode>(`/${wabaId}`, token, { fields: fallback.join(',') }).catch(() => {
        throw error;
      });
    }
  }
}
