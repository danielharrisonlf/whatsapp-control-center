/**
 * Shapes of the `whatsapp_business_account` webhook payload we read.
 * https://developers.facebook.com/docs/whatsapp/webhooks/reference
 * Only the fields used by the processor are typed; everything else is stored untouched.
 */
export interface WebhookPayload {
  object?: string;
  entry?: WebhookEntry[];
}

export interface WebhookEntry {
  id?: string;
  time?: number;
  changes?: WebhookChange[];
}

export interface WebhookChange {
  field?: string;
  value?: Record<string, unknown>;
}

export interface InboundMessage {
  id: string;
  from?: string;
  from_user_id?: string;
  timestamp?: string;
  type?: string;
  [key: string]: unknown;
}

export interface StatusUpdate {
  id: string;
  status: string;
  timestamp?: string;
  recipient_id?: string;
  recipient_user_id?: string;
  errors?: unknown[];
  pricing?: unknown;
  conversation?: unknown;
}

export interface MessagesValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: { wa_id?: string; user_id?: string; profile?: { name?: string } }[];
  messages?: InboundMessage[];
  statuses?: StatusUpdate[];
  errors?: unknown[];
}

/** First WABA id, phone number id, field and a finer event type, for filtering in the explorer. */
export function summarizePayload(payload: WebhookPayload) {
  const entry = payload.entry?.[0];
  const change = entry?.changes?.[0];
  const value = (change?.value ?? {}) as MessagesValue & Record<string, unknown>;
  let eventType = change?.field ?? null;
  if (change?.field === 'messages') {
    if (value.messages?.[0]) eventType = `messages.${value.messages[0].type ?? 'unknown'}`;
    else if (value.statuses?.[0]) eventType = `statuses.${value.statuses[0].status}`;
    else if (value.errors?.length) eventType = 'messages.errors';
  } else if (typeof value.event === 'string') {
    eventType = `${change?.field}.${value.event}`;
  }
  return {
    object: payload.object ?? null,
    field: change?.field ?? null,
    eventType,
    metaWabaId: entry?.id ?? null,
    metaPhoneNumberId: value.metadata?.phone_number_id ?? null,
  };
}

const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document', 'sticker']);

export function inboundMedia(message: InboundMessage) {
  if (!message.type || !MEDIA_TYPES.has(message.type)) return null;
  const media = message[message.type] as
    | { id?: string; mime_type?: string; sha256?: string; filename?: string }
    | undefined;
  return media?.id ? media : null;
}

/** Delivery statuses only move forward; `failed` always wins. */
const STATUS_RANK: Record<string, number> = {
  accepted: 0,
  held_for_quality_assessment: 0,
  paused: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  played: 4,
};

export function shouldAdvanceStatus(current: string, next: string) {
  if (next === 'failed') return true;
  if (current === 'failed') return false;
  return (STATUS_RANK[next] ?? 0) > (STATUS_RANK[current] ?? 0);
}

export function metaTimestamp(ts?: string | number) {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
}
