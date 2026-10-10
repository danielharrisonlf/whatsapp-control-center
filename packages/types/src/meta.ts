/**
 * Values defined by Meta's WhatsApp Business Platform, as documented for Graph API v26.0
 * (see docs/meta-reference.md). Meta adds values over time, so code that reads these from
 * Meta must accept unknown strings: use these lists for UI options and labels, never to
 * reject data that came from Meta.
 */

export const TEMPLATE_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/** Template statuses accepted by the `status` filter of GET /{waba-id}/message_templates. */
export const TEMPLATE_STATUSES = [
  'APPROVED',
  'PENDING',
  'REJECTED',
  'PAUSED',
  'DISABLED',
  'IN_APPEAL',
  'PENDING_DELETION',
  'DELETED',
  'LIMIT_EXCEEDED',
  'ARCHIVED',
] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

/** Template statuses that can be edited with POST /{template-id}. */
export const EDITABLE_TEMPLATE_STATUSES: readonly string[] = ['APPROVED', 'REJECTED', 'PAUSED'];

export const TEMPLATE_REJECTION_REASONS: Record<string, string> = {
  ABUSIVE_CONTENT: 'Abusive content',
  INCORRECT_CATEGORY: 'Incorrect category',
  INVALID_FORMAT: 'Invalid format',
  PROMOTIONAL: 'Promotional content in a non-marketing template',
  SCAM: 'Flagged as scam',
  TAG_CONTENT_MISMATCH: 'Content does not match the category',
  NONE: 'No reason provided',
};

export const QUALITY_SCORES = ['GREEN', 'YELLOW', 'RED', 'UNKNOWN'] as const;

/** Phone number `quality_rating` values. */
export const PHONE_QUALITY_RATINGS = ['GREEN', 'YELLOW', 'RED', 'NA', 'UNKNOWN'] as const;

/** Phone number `status` values. */
export const PHONE_STATUSES = ['CONNECTED', 'PENDING', 'FLAGGED', 'RESTRICTED', 'BANNED'] as const;

export const PHONE_NAME_STATUSES = [
  'APPROVED',
  'AVAILABLE_WITHOUT_REVIEW',
  'DECLINED',
  'EXPIRED',
  'PENDING_REVIEW',
  'NONE',
] as const;

export const MESSAGING_LIMIT_TIERS: Record<string, string> = {
  TIER_250: '250 users / 24h',
  TIER_2K: '2,000 users / 24h',
  TIER_10K: '10,000 users / 24h',
  TIER_100K: '100,000 users / 24h',
  TIER_UNLIMITED: 'Unlimited',
};

export const ACCOUNT_REVIEW_STATUSES = ['APPROVED', 'DEFERRED', 'PENDING', 'REJECTED'] as const;

export const BUSINESS_VERIFICATION_STATUSES = [
  'EXPIRED',
  'FAILED',
  'INELIGIBLE',
  'NOT_VERIFIED',
  'PENDING',
  'PENDING_NEED_MORE_INFO',
  'PENDING_SUBMISSION',
  'REJECTED',
  'REVOKED',
  'VERIFIED',
] as const;

/** `vertical` values accepted by POST /{phone-number-id}/whatsapp_business_profile. */
export const BUSINESS_VERTICALS: Record<string, string> = {
  ALCOHOL: 'Alcoholic beverages',
  APPAREL: 'Clothing and apparel',
  AUTO: 'Automotive',
  BEAUTY: 'Beauty, spa and salon',
  EDU: 'Education',
  ENTERTAIN: 'Entertainment',
  EVENT_PLAN: 'Event planning and service',
  FINANCE: 'Finance and banking',
  GOVT: 'Public service',
  GROCERY: 'Food and grocery',
  HEALTH: 'Medical and health',
  HOTEL: 'Hotel and lodging',
  NONPROFIT: 'Non-profit',
  ONLINE_GAMBLING: 'Online gambling and gaming',
  OTC_DRUGS: 'Over-the-counter drugs',
  OTHER: 'Other',
  PHYSICAL_GAMBLING: 'Non-online gambling and gaming',
  PROF_SERVICES: 'Professional services',
  RESTAURANT: 'Restaurant',
  RETAIL: 'Shopping and retail',
  TRAVEL: 'Travel and transportation',
};

export const BUSINESS_PROFILE_LIMITS = {
  about: 139,
  address: 256,
  description: 512,
  email: 128,
  website: 256,
  websites: 2,
} as const;

export const FLOW_STATUSES = ['DRAFT', 'PUBLISHED', 'DEPRECATED', 'BLOCKED', 'THROTTLED'] as const;

export const FLOW_CATEGORIES = [
  'SIGN_UP',
  'SIGN_IN',
  'APPOINTMENT_BOOKING',
  'LEAD_GENERATION',
  'CONTACT_US',
  'CUSTOMER_SUPPORT',
  'SURVEY',
  'OTHER',
] as const;

/** Webhook fields of the `whatsapp_business_account` object (plus `flows`, documented separately). */
export const WEBHOOK_FIELDS = [
  'messages',
  'message_template_status_update',
  'message_template_quality_update',
  'message_template_components_update',
  'template_category_update',
  'phone_number_name_update',
  'phone_number_quality_update',
  'account_update',
  'account_review_update',
  'account_alerts',
  'business_capability_update',
  'flows',
  'security',
  'history',
  'smb_app_state_sync',
  'smb_message_echoes',
  'user_preferences',
  'automatic_events',
  'partner_solutions',
  'payment_configuration_update',
] as const;

/** Delivery statuses reported in `statuses[].status`. */
export const MESSAGE_DELIVERY_STATUSES = ['sent', 'delivered', 'read', 'played', 'failed'] as const;

/** Message types accepted by POST /{phone-number-id}/messages. */
export const OUTBOUND_MESSAGE_TYPES = [
  'text',
  'template',
  'image',
  'video',
  'audio',
  'document',
  'sticker',
  'location',
  'contacts',
  'reaction',
  'interactive',
] as const;
export type OutboundMessageType = (typeof OUTBOUND_MESSAGE_TYPES)[number];

/** Interactive message types the playground supports (product/catalog types need a catalog). */
export const INTERACTIVE_TYPES = ['button', 'list', 'cta_url', 'flow', 'location_request_message'] as const;

export const MEDIA_TYPES = {
  image: { mimeTypes: ['image/jpeg', 'image/png'], maxBytes: 5 * 1024 * 1024 },
  video: { mimeTypes: ['video/mp4', 'video/3gpp'], maxBytes: 16 * 1024 * 1024 },
  audio: {
    mimeTypes: ['audio/aac', 'audio/amr', 'audio/mpeg', 'audio/mp4', 'audio/ogg'],
    maxBytes: 16 * 1024 * 1024,
  },
  document: {
    mimeTypes: [
      'text/plain',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
    maxBytes: 100 * 1024 * 1024,
  },
  sticker: { mimeTypes: ['image/webp'], maxBytes: 500 * 1024 },
} as const;
export type MediaKind = keyof typeof MEDIA_TYPES;

export const ALL_MEDIA_MIME_TYPES: string[] = Object.values(MEDIA_TYPES).flatMap((t) => [...t.mimeTypes]);

export function mediaKindForMime(mime: string): MediaKind | null {
  for (const [kind, def] of Object.entries(MEDIA_TYPES)) {
    if ((def.mimeTypes as readonly string[]).includes(mime)) return kind as MediaKind;
  }
  return null;
}

/** Permissions this application asks for. */
export const META_PERMISSIONS = {
  whatsapp_business_management: 'Manage WABAs, phone numbers, templates, flows, analytics and webhooks',
  whatsapp_business_messaging: 'Send messages, upload media, register phone numbers',
  business_management: 'Discover WABAs owned by or shared with a business portfolio',
} as const;
export type MetaPermission = keyof typeof META_PERMISSIONS;

/** Languages most commonly used for templates (Meta supports more; any code Meta returns is kept). */
export const TEMPLATE_LANGUAGES: Record<string, string> = {
  af: 'Afrikaans',
  ar: 'Arabic',
  bn: 'Bengali',
  zh_CN: 'Chinese (CHN)',
  zh_HK: 'Chinese (HKG)',
  zh_TW: 'Chinese (TAI)',
  cs: 'Czech',
  da: 'Danish',
  nl: 'Dutch',
  en: 'English',
  en_GB: 'English (UK)',
  en_US: 'English (US)',
  fil: 'Filipino',
  fi: 'Finnish',
  fr: 'French',
  de: 'German',
  el: 'Greek',
  he: 'Hebrew',
  hi: 'Hindi',
  hu: 'Hungarian',
  id: 'Indonesian',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  ms: 'Malay',
  nb: 'Norwegian',
  pl: 'Polish',
  pt_BR: 'Portuguese (BR)',
  pt_PT: 'Portuguese (POR)',
  ro: 'Romanian',
  ru: 'Russian',
  es: 'Spanish',
  es_AR: 'Spanish (ARG)',
  es_ES: 'Spanish (SPA)',
  es_MX: 'Spanish (MEX)',
  sv: 'Swedish',
  th: 'Thai',
  tr: 'Turkish',
  uk: 'Ukrainian',
  ur: 'Urdu',
  vi: 'Vietnamese',
};
