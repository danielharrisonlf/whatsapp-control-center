/** Normalized Graph API error, as returned by the API to the frontend. */
export interface MetaErrorInfo {
  httpStatus: number;
  metaCode: number | null;
  metaSubcode: number | null;
  type: string | null;
  message: string;
  userTitle: string | null;
  userMessage: string | null;
  details: string | null;
  traceId: string | null;
  isTransient: boolean;
  /** Sanitized raw error object. */
  raw: unknown;
}

/** Error body returned by every API endpoint. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  code: string;
  requestId?: string;
  issues?: { path: string; message: string }[];
  meta?: MetaErrorInfo;
}

/**
 * Human explanations for the WhatsApp error codes developers hit most.
 * Source: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
export const META_ERROR_HINTS: Record<number, { title: string; hint: string }> = {
  0: { title: 'Authentication failed', hint: 'The access token is invalid. Reconnect the Meta account.' },
  3: { title: 'Capability missing', hint: 'The app lacks the capability or permission for this call.' },
  4: { title: 'App rate limit reached', hint: 'Too many calls from this app. Retry after a short wait.' },
  10: {
    title: 'Permission denied',
    hint: 'The token is missing a required permission or the asset was not shared with it.',
  },
  100: {
    title: 'Invalid parameter',
    hint: 'Meta rejected one of the request fields. See technical details.',
  },
  190: { title: 'Access token expired', hint: 'Generate a new token or reconnect with Embedded Signup.' },
  200: { title: 'Permission denied', hint: 'The token does not have access to this asset.' },
  368: { title: 'Account restricted', hint: 'The account is temporarily blocked for policy violations.' },
  80007: { title: 'WABA rate limit', hint: 'This WhatsApp account hit its rate limit. Retry later.' },
  80008: {
    title: 'Management API rate limit',
    hint: 'Too many management calls for this WABA. Retry later.',
  },
  130429: {
    title: 'Throughput limit reached',
    hint: 'The number is sending faster than its throughput allows.',
  },
  131000: {
    title: 'Unknown Meta error',
    hint: 'Meta failed to process the request. Retrying usually works.',
  },
  131005: { title: 'Access denied', hint: 'Permission is missing or was revoked.' },
  131008: { title: 'Required parameter missing', hint: 'A required field was not sent.' },
  131009: { title: 'Invalid parameter value', hint: 'A field has an invalid value.' },
  131016: { title: 'Service unavailable', hint: 'Meta is temporarily unavailable.' },
  131021: {
    title: 'Sender equals recipient',
    hint: 'You cannot send a message to the sending number itself.',
  },
  131026: {
    title: 'Message undeliverable',
    hint: 'The recipient may not have WhatsApp, may use an old version, or has not accepted the terms.',
  },
  131030: {
    title: 'Recipient not allowed',
    hint: 'Test numbers can only message recipients added to the allowed list in the Meta App dashboard.',
  },
  131031: { title: 'Account locked', hint: 'The business account was locked. Check WhatsApp Manager.' },
  131037: { title: 'Display name not approved', hint: 'The display name needs approval before sending.' },
  131042: { title: 'Payment issue', hint: 'Add or fix the payment method in WhatsApp Manager.' },
  131045: { title: 'Number not registered', hint: 'Register the phone number before sending.' },
  131047: {
    title: 'Customer service window closed',
    hint: 'More than 24 hours passed since the user last wrote. Send an approved template instead.',
  },
  131048: {
    title: 'Spam rate limit',
    hint: 'Messages are being limited due to quality. Review recent feedback.',
  },
  131049: {
    title: 'Marketing limit for this user',
    hint: 'Meta limited marketing messages to this user. Retry after 24 hours.',
  },
  131050: { title: 'User opted out of marketing', hint: 'Do not send marketing messages to this user.' },
  131051: { title: 'Unsupported message type', hint: 'This message type is not supported.' },
  131052: { title: 'Media download failed', hint: 'Meta could not download the media sent by the user.' },
  131053: {
    title: 'Media upload failed',
    hint: 'Check the media type and size, and that the link is public.',
  },
  131056: {
    title: 'Too many messages to this user',
    hint: 'Wait a few seconds before messaging the same user again.',
  },
  131057: {
    title: 'Account in maintenance',
    hint: 'A throughput upgrade or maintenance is in progress. Retry shortly.',
  },
  131059: { title: 'Invalid page cursor', hint: 'The pagination cursor expired. Reload the list.' },
  131063: {
    title: 'Use the Marketing Messages API',
    hint: 'Marketing templates must be sent through the Marketing Messages API.',
  },
  132000: {
    title: 'Wrong number of parameters',
    hint: 'The parameters do not match the template variables.',
  },
  132001: {
    title: 'Template not found',
    hint: 'The template does not exist in this language or is not approved.',
  },
  132005: { title: 'Text too long', hint: 'The text with parameters exceeds the allowed length.' },
  132007: { title: 'Template policy violation', hint: 'The content violates WhatsApp policy.' },
  132012: {
    title: 'Parameter format mismatch',
    hint: 'A parameter does not match the format the template expects.',
  },
  132015: { title: 'Template paused', hint: 'The template was paused due to low quality.' },
  132016: { title: 'Template disabled', hint: 'The template was permanently disabled due to low quality.' },
  132068: { title: 'Flow blocked', hint: 'The flow is blocked. Check its health in Meta.' },
  132069: { title: 'Flow throttled', hint: 'The flow is throttled to 10 messages per hour.' },
  133000: { title: 'Incomplete deregistration', hint: 'Deregister the number, then register it again.' },
  133004: { title: 'Server unavailable', hint: 'Meta is temporarily unavailable. Retry.' },
  133005: {
    title: 'Wrong two-step PIN',
    hint: 'The PIN does not match. Reset it in WhatsApp Manager if it was lost.',
  },
  133006: { title: 'Number needs verification', hint: 'Request and verify a code before registering.' },
  133008: { title: 'Too many PIN attempts', hint: 'Wait before trying the PIN again.' },
  133009: { title: 'PIN entered too fast', hint: 'Wait before trying the PIN again.' },
  133010: { title: 'Number not registered', hint: 'Register the phone number first.' },
  133015: { title: 'Number recently deleted', hint: 'Wait 5 minutes and try again.' },
  133016: {
    title: 'Registration limit reached',
    hint: 'A number can be registered or deregistered 10 times in 72 hours. It is blocked until the window passes.',
  },
};

/** Codes Meta documents as transient: safe to retry with backoff. */
export const META_TRANSIENT_CODES: ReadonlySet<number> = new Set([
  1, 2, 4, 17, 341, 80007, 80008, 130429, 131000, 131016, 131056, 131057, 133004,
]);
