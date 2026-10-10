import { describe, expect, it } from 'vitest';
import { shouldAdvanceStatus, summarizePayload } from './webhook-payload';
import { signMetaPayload, verifyMetaSignature } from './webhook-signature';

const secret = '0123456789abcdef0123456789abcdef';

describe('verifyMetaSignature', () => {
  const body = Buffer.from(
    '{"object":"whatsapp_business_account","entry":[{"id":"1","changes":[]}],"text":"ação"}',
  );

  it('accepts the HMAC-SHA256 of the raw body', () => {
    expect(verifyMetaSignature(body, signMetaPayload(body, secret), secret)).toBe(true);
  });

  it('rejects other secrets, modified bodies and malformed headers', () => {
    const sig = signMetaPayload(body, secret);
    expect(verifyMetaSignature(body, sig, 'f'.repeat(32))).toBe(false);
    expect(verifyMetaSignature(Buffer.from(`${body} `), sig, secret)).toBe(false);
    expect(verifyMetaSignature(body, 'sha1=abc', secret)).toBe(false);
    expect(verifyMetaSignature(body, undefined, secret)).toBe(false);
    expect(verifyMetaSignature(body, sig, '')).toBe(false);
  });

  it('does not match re-serialized JSON (unicode escaping differs)', () => {
    const reserialized = Buffer.from(
      JSON.stringify(JSON.parse(body.toString())).replace('ação', '\\u00e7\\u00e3o'),
    );
    expect(verifyMetaSignature(reserialized, signMetaPayload(body, secret), secret)).toBe(false);
  });
});

describe('summarizePayload', () => {
  it('derives filter fields from the first change', () => {
    expect(
      summarizePayload({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA',
            changes: [
              {
                field: 'messages',
                value: { metadata: { phone_number_id: 'PN' }, statuses: [{ id: 'w', status: 'delivered' }] },
              },
            ],
          },
        ],
      }),
    ).toEqual({
      object: 'whatsapp_business_account',
      field: 'messages',
      eventType: 'statuses.delivered',
      metaWabaId: 'WABA',
      metaPhoneNumberId: 'PN',
    });
  });

  it('names template events by their event value', () => {
    expect(
      summarizePayload({
        entry: [
          { id: 'W', changes: [{ field: 'message_template_status_update', value: { event: 'APPROVED' } }] },
        ],
      }).eventType,
    ).toBe('message_template_status_update.APPROVED');
  });
});

describe('shouldAdvanceStatus', () => {
  it('moves forward only, failed always wins', () => {
    expect(shouldAdvanceStatus('accepted', 'sent')).toBe(true);
    expect(shouldAdvanceStatus('read', 'delivered')).toBe(false);
    expect(shouldAdvanceStatus('delivered', 'failed')).toBe(true);
    expect(shouldAdvanceStatus('failed', 'read')).toBe(false);
  });
});
