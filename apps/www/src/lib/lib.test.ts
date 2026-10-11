import { ApiRequestError } from '@wacc/api-client';
import { describe, expect, it } from 'vitest';
import { toDisplayError } from './errors';
import { formatPhone, humanize } from './format';

describe('toDisplayError', () => {
  it('prefers Meta user-facing titles and messages', () => {
    const error = new ApiRequestError(422, {
      statusCode: 422,
      error: 'Unprocessable Entity',
      code: 'META_ERROR',
      message: 'x',
      requestId: 'req-1',
      meta: {
        httpStatus: 400,
        metaCode: 131047,
        metaSubcode: null,
        type: 'OAuthException',
        message: '(#131047) Re-engagement message',
        userTitle: null,
        userMessage: null,
        details: null,
        traceId: 'Atrace',
        isTransient: false,
        raw: null,
      },
    });
    const display = toDisplayError(error);
    expect(display.title).toBe('Customer service window closed');
    expect(display.code).toBe('131047');
    expect(display.requestId).toBe('req-1');
  });

  it('names permission problems explicitly', () => {
    const error = new ApiRequestError(403, {
      statusCode: 403,
      error: 'Forbidden',
      code: 'META_PERMISSION_MISSING',
      message: 'whatsapp_business_management missing',
    });
    expect(toDisplayError(error).title).toBe('Meta permission missing');
  });
});

describe('format', () => {
  it('humanizes enum values and keeps acronyms', () => {
    expect(humanize('CLOUD_API')).toBe('Cloud API');
    expect(humanize('PENDING_REVIEW')).toBe('Pending review');
  });

  it('formats phone numbers internationally', () => {
    expect(formatPhone('5591999999999')).toBe('+55 91 99999 9999');
  });
});
