import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../config/env';
import type { ApiLogService } from '../api-logs/api-log.service';
import { MetaApiError, parseMetaError } from './meta-error';
import { MetaGraphClient } from './meta-graph.client';

const env = {
  META_GRAPH_BASE_URL: 'https://graph.test',
  META_GRAPH_API_VERSION: 'v26.0',
  META_GRAPH_TIMEOUT_MS: 1000,
  META_GRAPH_MAX_RETRIES: 2,
} as Env;
const logs = { record: vi.fn() } as unknown as ApiLogService;

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('MetaGraphClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: MetaGraphClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    client = new MetaGraphClient(env, logs);
  });
  afterEach(() => vi.restoreAllMocks());

  it('builds versioned URLs from configuration', async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { id: '1' }));
    await client.get('/123', 'tok', { fields: 'id,name', list: ['a'] });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://graph.test/v26.0/123?fields=id%2Cname&list=%5B%22a%22%5D');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('retries GETs on 5xx and succeeds', async () => {
    fetchMock.mockResolvedValueOnce(
      respond(500, { error: { code: 2, message: 'Service temporarily unavailable', is_transient: true } }),
    );
    fetchMock.mockResolvedValueOnce(respond(200, { ok: true }));
    await expect(client.get('/x', 'tok')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry invalid 4xx requests', async () => {
    fetchMock.mockResolvedValue(respond(400, { error: { code: 100, message: 'Invalid parameter' } }));
    await expect(client.get('/x', 'tok')).rejects.toBeInstanceOf(MetaApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries rate limits (429)', async () => {
    fetchMock.mockResolvedValueOnce(respond(429, { error: { code: 80007, message: 'Rate limit' } }));
    fetchMock.mockResolvedValueOnce(respond(200, { ok: 1 }));
    await expect(client.get('/x', 'tok')).resolves.toEqual({ ok: 1 });
  });

  it('never retries a POST that may have been executed (timeout / 5xx)', async () => {
    fetchMock.mockResolvedValue(respond(500, { error: { code: 131000, message: 'Something went wrong' } }));
    await expect(client.post('/phone/messages', 'tok', { to: '1' })).rejects.toBeInstanceOf(MetaApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('turns network failures into transient Meta errors', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
    const error = await client
      .request({ method: 'POST', path: '/x', token: 't', retry: 'never' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(MetaApiError);
    expect(error.info).toMatchObject({ httpStatus: 0, isTransient: true, type: 'Timeout' });
  });

  it('follows cursors only while Meta returns a next page', async () => {
    fetchMock.mockResolvedValueOnce(
      respond(200, { data: [{ id: 1 }], paging: { cursors: { after: 'A' }, next: 'https://next' } }),
    );
    fetchMock.mockResolvedValueOnce(respond(200, { data: [{ id: 2 }], paging: { cursors: { after: 'B' } } }));
    const result = await client.collect<{ id: number }>('/waba/phone_numbers', 'tok');
    expect(result).toEqual({ items: [{ id: 1 }, { id: 2 }], truncated: false });
    expect(String(fetchMock.mock.calls[1]![0])).toContain('after=A');
  });

  it('pauses calls when Meta reports business use case throttling', async () => {
    const usage = JSON.stringify({
      '999': [{ type: 'whatsapp_business_management', call_count: 100, estimated_time_to_regain_access: 5 }],
    });
    fetchMock.mockResolvedValueOnce(respond(200, { ok: 1 }, { 'x-business-use-case-usage': usage }));
    await client.get('/a', 'tok', undefined, { throttleKey: '999' });
    await expect(client.get('/a', 'tok', undefined, { throttleKey: '999' })).rejects.toBeInstanceOf(
      MetaApiError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('parseMetaError', () => {
  it('normalizes the Graph error object with hints', () => {
    const info = parseMetaError(400, {
      error: {
        message: '(#131047) Re-engagement message',
        type: 'OAuthException',
        code: 131047,
        error_data: { details: 'More than 24 hours' },
        fbtrace_id: 'Atrace',
      },
    });
    expect(info).toMatchObject({
      httpStatus: 400,
      metaCode: 131047,
      details: 'More than 24 hours',
      traceId: 'Atrace',
      userTitle: 'Customer service window closed',
      isTransient: false,
    });
  });

  it('marks documented transient codes', () => {
    expect(parseMetaError(400, { error: { code: 131056, message: 'pair rate limit' } }).isTransient).toBe(
      true,
    );
  });

  it('sanitizes the raw body', () => {
    const info = parseMetaError(400, { error: { code: 100, message: 'bad', access_token: 'EAAsecret' } });
    expect(JSON.stringify(info.raw)).not.toContain('EAAsecret');
  });
});
