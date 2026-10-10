import { describe, expect, it } from 'vitest';
import { REDACTED, redactText, sanitize, sanitizeUrl, truncateJson } from './sanitize';

describe('sanitize', () => {
  it('redacts sensitive keys at any depth', () => {
    const out = sanitize({
      access_token: 'EAAxyz',
      nested: { appSecret: 'abc', pin: '123456', code: '998877', verify_token: 'vt' },
      list: [{ password: 'p' }],
      ok: 'visible',
    });
    expect(out).toEqual({
      access_token: REDACTED,
      nested: { appSecret: REDACTED, pin: REDACTED, code: REDACTED, verify_token: REDACTED },
      list: [{ password: REDACTED }],
      ok: 'visible',
    });
  });

  it('keeps numeric Meta error codes', () => {
    expect(sanitize({ error: { code: 131030, message: 'x' } })).toEqual({
      error: { code: 131030, message: 'x' },
    });
  });

  it('redacts tokens embedded in text', () => {
    expect(redactText('Authorization: Bearer abcdefghijklmnopqrstuvwxyz123')).toBe(
      `Authorization: ${REDACTED}`,
    );
    expect(redactText(`token=EAAG${'a'.repeat(40)} end`)).toBe(`token=${REDACTED} end`);
  });

  it('redacts sensitive query parameters', () => {
    const url = sanitizeUrl('https://graph.facebook.com/v26.0/debug_token?input_token=EAAsecret&fields=id');
    expect(url).toContain(`input_token=${REDACTED}`);
    expect(url).toContain('fields=id');
    expect(url).not.toContain('EAAsecret');
  });

  it('truncates large bodies', () => {
    const big = { text: 'x'.repeat(50_000) };
    expect(truncateJson(big, 1000)).toMatchObject({ _truncated: true });
  });
});
