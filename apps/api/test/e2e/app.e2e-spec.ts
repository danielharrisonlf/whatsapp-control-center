import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * End-to-end: the real Nest app + PostgreSQL. The Graph API is replaced by the test-only fake
 * server (apps/www/e2e/fake-graph.mjs) through META_GRAPH_BASE_URL.
 */
const ORIGIN = 'http://localhost:5173';
let app: INestApplication;
let http: ReturnType<typeof request.agent>;
let FAKE: { appId: string; appSecret: string; token: string; wabaId: string };

async function agent() {
  return request.agent(app.getHttpServer());
}

async function signUp(email: string) {
  const a = await agent();
  await a
    .post('/auth/register')
    .set('Origin', ORIGIN)
    .send({ name: email.split('@')[0], email, password: 'correct horse battery' })
    .expect(201);
  return a;
}

beforeAll(async () => {
  process.env.FAKE_GRAPH_PORT = '4091';
  process.env.META_GRAPH_BASE_URL = 'http://localhost:4091';
  const fake = await import(pathToFileURL(resolve(__dirname, '../../../www/e2e/fake-graph.mjs')).href);
  FAKE = fake.FAKE;
  const { AppModule } = await import('../../src/app.module');
  app = await NestFactory.create(AppModule, { rawBody: true, logger: ['error'] });
  app.use(cookieParser());
  await app.init();
  await app.listen(0);
  process.env.API_PUBLIC_URL = `http://localhost:${(app.getHttpServer().address() as AddressInfo).port}`;
  http = await signUp('owner@example.com');
});

afterAll(async () => {
  await app?.close();
});

describe('auth and organizations', () => {
  it('rejects anonymous access', async () => {
    const res = await request(app.getHttpServer()).get('/organizations').expect(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('blocks cross-site state changes made with session cookies', async () => {
    const res = await http
      .post('/organizations')
      .set('Origin', 'https://evil.test')
      .send({ name: 'Evil' })
      .expect(403);
    expect(res.body.message).toMatch(/Cross-site/);
  });

  it('validates input with field-level issues', async () => {
    const res = await http.post('/organizations').set('Origin', ORIGIN).send({ name: '' }).expect(400);
    expect(res.body.issues[0].path).toBe('name');
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const a = await signUp('rotation@example.com');
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: 'rotation@example.com', password: 'correct horse battery' })
      .expect(200);
    const cookies = login.headers['set-cookie'] as unknown as string[];
    const refresh = cookies.find((c) => c.startsWith('wacc_rt='))!.split(';')[0]!;
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', refresh)
      .expect(200);
    // Reusing the old refresh token revokes the session.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', refresh)
      .expect(401);
    expect(a).toBeTruthy();
  });
});

describe('Meta workflow', () => {
  let orgId: string;
  let wabaId: string;
  let phoneId: string;
  let connection: { id: string; webhook: { callbackUrl: string } };

  it('creates an organization and connects Meta (manual setup)', async () => {
    orgId = (await http.post('/organizations').set('Origin', ORIGIN).send({ name: 'Acme' }).expect(201)).body
      .id;
    const res = await http
      .post(`/organizations/${orgId}/connections/manual`)
      .set('Origin', ORIGIN)
      .send({
        name: 'Prod',
        appId: FAKE.appId,
        appSecret: FAKE.appSecret,
        accessToken: FAKE.token,
        wabaId: FAKE.wabaId,
      })
      .expect(201);
    connection = res.body.connection;
    expect(res.body.report).toMatchObject({ wabas: 1, phoneNumbers: 2, templates: 4, errors: [] });
    expect(res.body.connection.accessTokenPreview).toBe('EAAF•••••••000');
    expect(JSON.stringify(res.body)).not.toContain(FAKE.token);
    expect(JSON.stringify(res.body)).not.toContain(FAKE.appSecret);
  });

  it('rejects a token Meta reports as invalid', async () => {
    const res = await http
      .post(`/organizations/${orgId}/connections/manual`)
      .set('Origin', ORIGIN)
      .send({
        name: 'Bad',
        appId: FAKE.appId,
        appSecret: FAKE.appSecret,
        accessToken: 'EAAinvalidtoken000000000000',
        wabaId: FAKE.wabaId,
      })
      .expect(422);
    expect(res.body.message).toMatch(/invalid/i);
  });

  it('lists WABAs, phone numbers and capabilities', async () => {
    const wabas = (await http.get(`/organizations/${orgId}/wabas`).expect(200)).body;
    wabaId = wabas[0].id;
    expect(wabas[0]).toMatchObject({ metaWabaId: FAKE.wabaId, phoneNumberCount: 2, appSubscribed: true });
    const phones = (await http.get(`/organizations/${orgId}/phone-numbers`).expect(200)).body;
    phoneId = phones.find((p: { status: string }) => p.status === 'CONNECTED').id;
    const caps = (await http.get(`/organizations/${orgId}/capabilities`).expect(200)).body;
    expect(caps).toMatchObject({ connected: true, canSendMessages: true, missingPermissions: [] });
  });

  it('validates templates with Meta rules before calling Meta', async () => {
    const res = await http
      .post(`/organizations/${orgId}/templates`)
      .set('Origin', ORIGIN)
      .send({
        wabaId,
        payload: {
          name: 'bad',
          language: 'en_US',
          category: 'UTILITY',
          components: [{ type: 'BODY', text: '{{1}} starts with a variable' }],
        },
      })
      .expect(400);
    expect(res.body.issues.map((i: { message: string }) => i.message)).toContain(
      'Text cannot start with a variable. Add text before it.',
    );
  });

  it('creates a template and filters the cached list', async () => {
    const res = await http
      .post(`/organizations/${orgId}/templates`)
      .set('Origin', ORIGIN)
      .send({
        wabaId,
        payload: {
          name: 'shipping_update',
          language: 'en_US',
          category: 'UTILITY',
          parameter_format: 'POSITIONAL',
          components: [
            { type: 'BODY', text: 'Hi {{1}}, your package ships today.', example: { body_text: [['Ana']] } },
          ],
        },
      })
      .expect(201);
    expect(res.body.template).toMatchObject({ name: 'shipping_update', status: 'PENDING' });
    const list = (await http.get(`/organizations/${orgId}/templates?status=APPROVED`).expect(200)).body;
    expect(list.items.every((t: { status: string }) => t.status === 'APPROVED')).toBe(true);
    const page1 = (await http.get(`/organizations/${orgId}/templates?limit=2`).expect(200)).body;
    const page2 = (
      await http.get(`/organizations/${orgId}/templates?limit=2&cursor=${page1.nextCursor}`).expect(200)
    ).body;
    expect(page1.items).toHaveLength(2);
    expect(page2.items.map((t: { id: string }) => t.id)).not.toContain(page1.items[0].id);
  });

  it('sends a message and returns Meta errors as part of the result', async () => {
    const ok = (
      await http
        .post(`/organizations/${orgId}/messages`)
        .set('Origin', ORIGIN)
        .send({ phoneNumberId: phoneId, to: '5591999990000', type: 'text', payload: { body: 'Hello' } })
        .expect(200)
    ).body;
    expect(ok).toMatchObject({
      ok: true,
      wamid: expect.stringMatching(/^wamid\./),
      response: { status: 200 },
    });

    const failed = (
      await http
        .post(`/organizations/${orgId}/messages`)
        .set('Origin', ORIGIN)
        .send({ phoneNumberId: phoneId, to: '0000123456', type: 'text', payload: { body: 'Hello' } })
        .expect(200)
    ).body;
    expect(failed.ok).toBe(false);
    expect(failed.error).toMatchObject({ metaCode: 131030, userTitle: 'Recipient not allowed' });
    expect(failed.message.status).toBe('failed');
  });

  it('verifies the webhook handshake and signatures, then processes events', async () => {
    const path = new URL(connection.webhook.callbackUrl).pathname;
    const reveal = (
      await http
        .post(`/organizations/${orgId}/connections/${connection.id}/webhook/reveal-verify-token`)
        .set('Origin', ORIGIN)
        .expect(200)
    ).body;
    await request(app.getHttpServer())
      .get(`${path}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42`)
      .expect(403);
    const ok = await request(app.getHttpServer())
      .get(`${path}?hub.mode=subscribe&hub.verify_token=${reveal.verifyToken}&hub.challenge=42`)
      .expect(200);
    expect(ok.text).toBe('42');

    const phone = (await http.get(`/organizations/${orgId}/phone-numbers/${phoneId}`).expect(200)).body;
    const payload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: FAKE.wabaId,
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '5591', phone_number_id: phone.metaPhoneNumberId },
                contacts: [{ profile: { name: 'Ana' }, wa_id: '5591999990000' }],
                messages: [
                  {
                    from: '5591999990000',
                    id: 'wamid.INBOUND1',
                    timestamp: '1759370000',
                    type: 'text',
                    text: { body: 'Oi' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const sign = (body: string) =>
      `sha256=${createHmac('sha256', FAKE.appSecret).update(body).digest('hex')}`;
    await request(app.getHttpServer())
      .post(path)
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', 'sha256=00')
      .send(payload)
      .expect(403);
    await request(app.getHttpServer())
      .post(path)
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sign(payload))
      .send(payload)
      .expect(200);
    // Duplicate delivery (Meta retries) must be idempotent.
    await request(app.getHttpServer())
      .post(path)
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sign(payload))
      .send(payload)
      .expect(200);
    await new Promise((r) => setTimeout(r, 500));

    const events = (await http.get(`/organizations/${orgId}/webhook-events?limit=10`).expect(200)).body.items;
    expect(events.map((e: { processingStatus: string }) => e.processingStatus).sort()).toEqual([
      'PROCESSED',
      'PROCESSED',
      'REJECTED',
    ]);
    const inbound = (await http.get(`/organizations/${orgId}/messages?direction=INBOUND`).expect(200)).body
      .items;
    expect(inbound).toHaveLength(1);

    const processed = events.find((e: { processingStatus: string }) => e.processingStatus === 'PROCESSED');
    const replay = (
      await http
        .post(`/organizations/${orgId}/webhook-events/${processed.id}/replay`)
        .set('Origin', ORIGIN)
        .expect(200)
    ).body;
    expect(replay).toMatchObject({ processingStatus: 'PROCESSED', attempts: 2 });
    const rejected = events.find((e: { processingStatus: string }) => e.processingStatus === 'REJECTED');
    await http
      .post(`/organizations/${orgId}/webhook-events/${rejected.id}/replay`)
      .set('Origin', ORIGIN)
      .expect(400);
  });

  it('never stores secrets in API logs or audit logs', async () => {
    const logs = (await http.get(`/organizations/${orgId}/api-logs?limit=100`).expect(200)).body.items;
    expect(logs.length).toBeGreaterThan(0);
    const details = await Promise.all(
      logs.slice(0, 30).map((l: { id: string }) => http.get(`/organizations/${orgId}/api-logs/${l.id}`)),
    );
    const audit = (await http.get(`/organizations/${orgId}/audit-logs?limit=100`).expect(200)).body;
    const everything = JSON.stringify([logs, details.map((d) => d.body), audit]);
    expect(everything).not.toContain(FAKE.token);
    expect(everything).not.toContain(FAKE.appSecret);
    expect(audit.items.map((a: { action: string }) => a.action)).toEqual(
      expect.arrayContaining(['META_CONNECTION_CREATED', 'WABA_CONNECTED', 'TEMPLATE_CREATED']),
    );
  });

  it('enforces membership and roles', async () => {
    const outsider = await signUp('outsider@example.com');
    await outsider.get(`/organizations/${orgId}/wabas`).expect(404);

    const invite = (
      await http
        .post(`/organizations/${orgId}/invitations`)
        .set('Origin', ORIGIN)
        .send({ email: 'viewer@example.com', role: 'VIEWER' })
        .expect(201)
    ).body;
    const viewer = await signUp('viewer@example.com');
    const token = invite.acceptUrl.split('/invite/')[1];
    await viewer.post('/organizations/invitations/accept').set('Origin', ORIGIN).send({ token }).expect(200);
    await viewer.get(`/organizations/${orgId}/templates`).expect(200);
    const denied = await viewer
      .post(`/organizations/${orgId}/messages`)
      .set('Origin', ORIGIN)
      .send({ phoneNumberId: phoneId, to: '5591999990000', type: 'text', payload: { body: 'x' } })
      .expect(403);
    expect(denied.body.message).toMatch(/VIEWER/);
    await viewer.get(`/organizations/${orgId}/audit-logs`).expect(403);
  });

  it('reports diagnostics in plain language', async () => {
    const res = (
      await http
        .post(`/organizations/${orgId}/connections/${connection.id}/diagnostics`)
        .set('Origin', ORIGIN)
        .expect(200)
    ).body;
    const labels = Object.fromEntries(
      res.checks.map((c: { label: string; status: string }) => [c.label, c.status]),
    );
    expect(labels).toMatchObject({
      'Meta API': 'ok',
      'Access token': 'ok',
      'Management permission': 'ok',
      'Messaging permission': 'ok',
    });
  });

  it('keeps /health up without Meta and reports PostgreSQL readiness', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
    const ready = (await request(app.getHttpServer()).get('/health/ready').expect(200)).body;
    expect(ready.checks.database.status).toBe('ok');
  });
});
