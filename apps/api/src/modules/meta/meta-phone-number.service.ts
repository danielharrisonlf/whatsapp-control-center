import { Injectable } from '@nestjs/common';
import { MetaGraphClient } from './meta-graph.client';

export interface MetaPhoneNode {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  code_verification_status?: string;
  quality_rating?: string;
  platform_type?: string;
  throughput?: { level?: string };
  name_status?: string;
  status?: string;
  whatsapp_business_manager_messaging_limit?: string;
  messaging_limit_tier?: string;
  last_onboarded_time?: string;
  is_official_business_account?: boolean;
  account_mode?: string;
}

export interface MetaBusinessProfile {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  profile_picture_url?: string;
  websites?: string[];
  vertical?: string;
}

export const PHONE_FIELDS = [
  'id',
  'display_phone_number',
  'verified_name',
  'code_verification_status',
  'quality_rating',
  'platform_type',
  'throughput',
  'name_status',
  'status',
  'whatsapp_business_manager_messaging_limit',
  'last_onboarded_time',
  'is_official_business_account',
  'account_mode',
].join(',');

const ok = { success: true } as const;
type Success = typeof ok | { success: boolean };

/**
 * Phone numbers, registration and business profile.
 * - https://developers.facebook.com/docs/whatsapp/cloud-api/reference/phone-numbers
 * - https://developers.facebook.com/docs/whatsapp/cloud-api/reference/registration
 * - https://developers.facebook.com/docs/whatsapp/cloud-api/reference/business-profiles
 */
@Injectable()
export class MetaPhoneNumberService {
  constructor(private readonly graph: MetaGraphClient) {}

  list(wabaId: string, token: string) {
    return this.graph.collect<MetaPhoneNode>(
      `/${wabaId}/phone_numbers`,
      token,
      { fields: PHONE_FIELDS },
      { maxItems: 500 },
    );
  }

  get(phoneNumberId: string, token: string) {
    return this.graph.get<MetaPhoneNode>(`/${phoneNumberId}`, token, { fields: PHONE_FIELDS });
  }

  /** Adds a number to the WABA. `phoneNumber` has no country code. */
  add(wabaId: string, token: string, input: { cc: string; phoneNumber: string; verifiedName: string }) {
    return this.graph.post<{ id: string }>(
      `/${wabaId}/phone_numbers`,
      token,
      { cc: input.cc, phone_number: input.phoneNumber, verified_name: input.verifiedName },
      { retry: 'never' },
    );
  }

  requestCode(phoneNumberId: string, token: string, method: 'SMS' | 'VOICE', language: string) {
    return this.graph.post<Success>(
      `/${phoneNumberId}/request_code`,
      token,
      { code_method: method, language },
      { retry: 'never' },
    );
  }

  verifyCode(phoneNumberId: string, token: string, code: string) {
    return this.graph.post<Success>(`/${phoneNumberId}/verify_code`, token, { code }, { retry: 'never' });
  }

  /** Counts toward the 10 register/deregister requests per 72h limit: never retried automatically. */
  register(phoneNumberId: string, token: string, pin: string, dataLocalizationRegion?: string) {
    return this.graph.post<Success>(
      `/${phoneNumberId}/register`,
      token,
      {
        messaging_product: 'whatsapp',
        pin,
        ...(dataLocalizationRegion ? { data_localization_region: dataLocalizationRegion } : {}),
      },
      { retry: 'never' },
    );
  }

  deregister(phoneNumberId: string, token: string) {
    return this.graph.post<Success>(`/${phoneNumberId}/deregister`, token, undefined, { retry: 'never' });
  }

  /** Sets or changes the two-step verification PIN. There is no API to disable it. */
  setTwoStepPin(phoneNumberId: string, token: string, pin: string) {
    return this.graph.post<Success>(`/${phoneNumberId}`, token, { pin }, { retry: 'never' });
  }

  async getBusinessProfile(phoneNumberId: string, token: string): Promise<MetaBusinessProfile> {
    const res = await this.graph.get<{ data: MetaBusinessProfile[] }>(
      `/${phoneNumberId}/whatsapp_business_profile`,
      token,
      {
        fields: 'about,address,description,email,profile_picture_url,websites,vertical',
      },
    );
    return res.data?.[0] ?? {};
  }

  updateBusinessProfile(
    phoneNumberId: string,
    token: string,
    profile: Omit<MetaBusinessProfile, 'profile_picture_url'> & { profile_picture_handle?: string },
  ) {
    return this.graph.post<Success>(
      `/${phoneNumberId}/whatsapp_business_profile`,
      token,
      { messaging_product: 'whatsapp', ...profile },
      { retry: 'idempotent' },
    );
  }
}
