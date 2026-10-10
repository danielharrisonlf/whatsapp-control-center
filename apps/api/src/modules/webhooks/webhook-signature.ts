import { hmacSha256Hex, safeEqual } from '../../common/crypto';

export const SIGNATURE_HEADER = 'x-hub-signature-256';

/**
 * Verifies `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256(app secret, raw body).
 * Must run on the exact bytes received: re-serialized JSON does not match (Meta escapes unicode).
 * https://developers.facebook.com/docs/graph-api/webhooks/getting-started#validate-payloads
 */
export function verifyMetaSignature(
  rawBody: Buffer | undefined,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!rawBody || !header || !appSecret) return false;
  const [scheme, signature] = header.split('=');
  if (scheme !== 'sha256' || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  return safeEqual(hmacSha256Hex(appSecret, rawBody), signature.toLowerCase());
}

export function signMetaPayload(rawBody: Buffer | string, appSecret: string) {
  return `sha256=${hmacSha256Hex(appSecret, rawBody)}`;
}
