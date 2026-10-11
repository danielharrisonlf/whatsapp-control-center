import { createHmac, generateKeyPairSync } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type APIRequestContext, type BrowserContext, expect, type Page, test } from '@playwright/test';

// Values understood by the fake Graph server (e2e/fake-graph.mjs).
const FAKE = {
  appId: '1234567890123',
  appSecret: '0123456789abcdef0123456789abcdef',
  token: 'EAAFAKETOKENFORTESTS0000000000000000000000000000',
  wabaId: '102030405060708',
  phoneId: '110000000000001',
};
const PASSWORD = 'correct horse battery';
const email = `e2e-${Date.now()}@example.com`;
const FAKE_GRAPH_URL = 'http://localhost:4011';
const normalizePem = (value: string) => value.replace(/\r\n/g, '\n').trim();
const PUBLIC_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .publicKey.export({
    type: 'spki',
    format: 'pem',
  })
  .toString();
const evidencePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../output/pdf/get-endpoints-test-evidence.json',
);
const evidence = [] as Record<string, unknown>[];
const evidenceTasks: Promise<void>[] = [];
let captureAuthenticatedGets = false;
let openApiPaths: Record<string, Record<string, { operationId?: string }>> = {};

type FakeGraphObservation = {
  feature: string;
  method: string;
  path: string;
  query: Record<string, string>;
  body: Record<string, unknown> | null;
};
type FakeGraphSnapshot = {
  phones: Record<
    string,
    {
      commerce: { is_cart_enabled: boolean; is_catalog_visible: boolean };
      publicKey: string | null;
      blockedUsers: string[];
      qrCodes: { code: string; prefilled_message: string }[];
    }
  >;
  observations: FakeGraphObservation[];
};

test.describe.configure({ mode: 'serial' });

// One authenticated session for the whole suite: the login endpoint is rate limited (5/min).
let context: BrowserContext;
let page: Page;
let orgPath = '';

test.beforeAll(async ({ browser }) => {
  const openApi = JSON.parse(
    await readFile(resolve(dirname(fileURLToPath(import.meta.url)), '../../api/openapi.json'), 'utf8'),
  ) as { paths?: Record<string, Record<string, { operationId?: string }>> };
  openApiPaths = openApi.paths ?? {};
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    if (!localStorage.getItem('wacc.locale')) localStorage.setItem('wacc.locale', 'en');
  });
  page = await context.newPage();
  page.on('response', (response) => {
    if (!captureAuthenticatedGets || response.request().method() !== 'GET') return;
    const url = new URL(response.url());
    if (!url.pathname.startsWith('/api/')) return;
    const route = url.pathname.replace(/^\/api/, '');
    const operationId = operationIdFor(route, 'get');
    const timing = response.request().timing();
    const durationMs = timing.responseEnd >= 0 ? Math.max(0, timing.responseEnd - timing.requestStart) : null;
    const task = response
      .json()
      .catch(() => null)
      .then((body) => {
        evidence.push({
          timestamp: new Date().toISOString(),
          environment: 'test',
          baseUrl: url.origin,
          graphApiBaseUrl: FAKE_GRAPH_URL,
          url: redactUrl(url),
          operationId,
          status: response.status(),
          durationMs,
          body: sanitizeEvidence(body),
        });
      });
    evidenceTasks.push(task);
  });
});
test.afterAll(async () => {
  // Closing first settles reads from requests cancelled by the last navigation.
  captureAuthenticatedGets = false;
  await context.close();
  await Promise.allSettled(evidenceTasks);
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(
    evidencePath,
    `${JSON.stringify(
      {
        environment: 'test',
        baseUrl: evidence[0]?.baseUrl ?? null,
        graphApiBaseUrl: FAKE_GRAPH_URL,
        responses: evidence,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
});

function operationIdFor(path: string, method: string) {
  for (const [template, operations] of Object.entries(openApiPaths)) {
    const expectedParts = template.split('/').filter(Boolean);
    const actualParts = path.split('/').filter(Boolean);
    if (
      expectedParts.length === actualParts.length &&
      expectedParts.every((part, index) => /^\{.+\}$/.test(part) || part === actualParts[index])
    ) {
      return operations[method]?.operationId ?? null;
    }
  }
  return null;
}

function redactUrl(url: URL) {
  const safe = new URL(url);
  for (const key of [...safe.searchParams.keys()]) {
    if (/token|secret|password|authorization|cookie|public.?key|private.?key|encryption.?key/i.test(key)) {
      safe.searchParams.set(key, '[REDACTED]');
    }
  }
  return safe.toString();
}

function sanitizeEvidence(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeEvidence(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([key, item]) => [
          key,
          /token|secret|password|authorization|cookie|public.?key|private.?key|encryption.?key/i.test(key)
            ? '[REDACTED]'
            : sanitizeEvidence(item, depth + 1),
        ]),
    );
  }
  if (typeof value === 'string') {
    const redacted = value
      .replaceAll(FAKE.token, '[REDACTED]')
      .replaceAll(FAKE.appSecret, '[REDACTED]')
      .replaceAll(PASSWORD, '[REDACTED]');
    return redacted.length > 4000 ? `${redacted.slice(0, 4000)}[TRUNCATED]` : redacted;
  }
  return value;
}

async function clearFakeGraphObservations() {
  const response = await page.request.delete(`${FAKE_GRAPH_URL}/__test/observations`);
  expect(response.ok()).toBeTruthy();
}

async function fakeGraphState() {
  const response = await page.request.get(`${FAKE_GRAPH_URL}/__test/state`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function localPhones() {
  const orgId = orgPath.split('/')[2];
  const response = await page.request.get(`/api/organizations/${orgId}/phone-numbers`);
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{ id: string; displayPhoneNumber: string }[]>;
}

async function openPhone(tab: 'Commerce' | 'Flow encryption' | 'Blocked users' | 'QR codes', number: RegExp) {
  await page.goto(`${orgPath}/phone-numbers`);
  const row = page.getByRole('row').filter({ hasText: number });
  await expect(row).toBeVisible();
  await row.click();
  await page.getByRole('tab', { name: tab }).click();
}

async function deliverInbound(
  request: APIRequestContext,
  input: { profileName: string; waId: string; message: string },
) {
  const orgId = orgPath.split('/')[2];
  const connections = await page.request
    .get(`/api/organizations/${orgId}/connections`)
    .then((response) => response.json());
  const callback = new URL(connections[0].webhook.callbackUrl);
  const wamid = `wamid.E2EInbox${Date.now()}`;
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: FAKE.wabaId,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '559198888111', phone_number_id: FAKE.phoneId },
              contacts: [{ profile: { name: input.profileName }, wa_id: input.waId }],
              messages: [
                {
                  from: input.waId,
                  id: wamid,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: input.message },
                },
              ],
            },
          },
        ],
      },
    ],
  });
  const signature = `sha256=${createHmac('sha256', FAKE.appSecret).update(body).digest('hex')}`;
  const response = await request.post(callback.toString(), {
    data: body,
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
  });
  expect(response.status()).toBe(200);
  return wamid;
}

async function home() {
  await page.goto(orgPath);
  await page.waitForURL(/\/o\/[^/]+/);
}

test('sign up, create an organization and see the first-run screen', async () => {
  await page.goto('/register');
  await page.getByLabel('Name').fill('E2E Owner');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Organization name').fill('E2E Corp');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page.getByRole('heading', { name: 'Connect your WhatsApp Business account' })).toBeVisible();
  await expect(page.getByText('Embedded Signup is not configured on this server')).toBeVisible();
  orgPath = page.url().match(/\/o\/[^/]+/)![0];
  captureAuthenticatedGets = true;
});

test('rejects wrong credentials with a clear message', async ({ page: anonymous }) => {
  const page = anonymous;
  await page.addInitScript(() => localStorage.setItem('wacc.locale', 'en'));
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('wrong password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
});

test('connect Meta with the advanced setup', async () => {
  await page.goto(`${orgPath}/connect`);
  await page.getByRole('button', { name: /Advanced: manual setup/ }).click();
  await page.getByLabel('Meta App ID').fill(FAKE.appId);
  await page.getByLabel('WABA ID').fill(FAKE.wabaId);
  await page.getByLabel('App secret').fill(FAKE.appSecret);
  await page.getByLabel('Access token').fill(FAKE.token);
  await page.getByRole('button', { name: 'Validate and connect' }).click();
  await expect(page.getByRole('heading', { name: 'WhatsApp connected' })).toBeVisible();
  await expect(page.locator('dl div').filter({ hasText: /^Phone numbers/ })).toContainText('2');
  // The token never comes back to the browser.
  await expect(page.locator('body')).not.toContainText(FAKE.token);
});

test('open the WABA and its phone numbers', async () => {
  await home();
  await page.getByRole('link', { name: 'Accounts' }).click();
  await page.getByRole('cell', { name: /Acme Brasil/ }).click();
  await expect(page.getByText('Business verification', { exact: true })).toBeVisible();
  await expect(page.getByText('Webhooks subscribed')).toBeVisible();
  await page.getByRole('link', { name: 'Phone numbers' }).first().click();
  await expect(page.getByRole('cell', { name: /\+55 91 98888 1111/ })).toBeVisible();
  await page.getByRole('cell', { name: /\+55 91 98888 1111/ }).click();
  await expect(page.getByText('Registered on Cloud API')).toBeVisible();
  await page.getByRole('tab', { name: 'Business profile' }).click();
  await expect(page.getByLabel('About')).toHaveValue('Pedidos e suporte');
});

test('commerce and Flow encryption settings persist per phone', async () => {
  await home();
  const phones = await localPhones();
  const first = phones.find((phone) => phone.displayPhoneNumber.includes('98888'));
  const second = phones.find((phone) => phone.displayPhoneNumber.includes('97777'));
  expect(first).toBeTruthy();
  expect(second).toBeTruthy();

  await openPhone('Commerce', /98888 1111/);
  await expect(page.getByLabel('Show catalog in WhatsApp')).toBeChecked();
  await expect(page.getByLabel('Enable shopping cart')).toBeChecked();
  await clearFakeGraphObservations();
  await page.getByLabel('Show catalog in WhatsApp').uncheck();
  await page.getByLabel('Enable shopping cart').uncheck();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Commerce settings saved')).toBeVisible();

  const commerceState = (await fakeGraphState()) as FakeGraphSnapshot;
  expect(commerceState.phones[FAKE.phoneId]?.commerce).toEqual({
    is_cart_enabled: false,
    is_catalog_visible: false,
  });
  expect(
    commerceState.observations.some(
      (entry) =>
        entry.feature === 'commerce-update' &&
        entry.method === 'POST' &&
        entry.path === `/${FAKE.phoneId}/whatsapp_commerce_settings` &&
        entry.query.is_cart_enabled === 'false' &&
        entry.query.is_catalog_visible === 'false',
    ),
  ).toBe(true);

  await page.goto(`${orgPath}/phone-numbers/${second!.id}?tab=commerce`);
  await expect(page.getByLabel('Enable shopping cart')).not.toBeChecked();
  await expect(page.getByLabel('Show catalog in WhatsApp')).toBeChecked();

  await openPhone('Flow encryption', /98888 1111/);
  await expect(page.getByText('Current key: Not configured')).toBeVisible();
  await clearFakeGraphObservations();
  await page.getByLabel('New public key (PEM)').fill(PUBLIC_KEY);
  await page.getByRole('button', { name: 'Set public key' }).click();
  await expect(page.getByText(/Current key: Configured/)).toBeVisible();
  const encryptionState = (await fakeGraphState()) as FakeGraphSnapshot;
  expect(normalizePem(encryptionState.phones[FAKE.phoneId]?.publicKey ?? '')).toBe(normalizePem(PUBLIC_KEY));
  expect(
    encryptionState.observations.some(
      (entry) =>
        entry.feature === 'encryption-update' &&
        entry.method === 'POST' &&
        entry.path === `/${FAKE.phoneId}/whatsapp_business_encryption` &&
        normalizePem(String(entry.body?.business_public_key ?? '')) === normalizePem(PUBLIC_KEY),
    ),
  ).toBe(true);

  await page.goto(`${orgPath}/phone-numbers/${second!.id}?tab=encryption`);
  await expect(page.getByText('Current key: Not configured')).toBeVisible();

  await clearFakeGraphObservations();
  const otherOrgId = '00000000-0000-4000-8000-000000000000';
  const crossTenant = await page.request.get(
    `/api/organizations/${otherOrgId}/phone-numbers/${first!.id}/commerce-settings`,
  );
  expect([403, 404]).toContain(crossTenant.status());
  expect(((await fakeGraphState()) as FakeGraphSnapshot).observations).toHaveLength(0);
});

test('blocked users paginate, preserve partial failures, and unblock through the matching phone', async () => {
  const successfulUser = '5591666612345';
  const failedUser = '5591777700002';
  const input = `${successfulUser}, ${failedUser}`;
  await openPhone('Blocked users', /98888 1111/);
  await expect(page.getByText('5591988800001', { exact: true })).toBeVisible();
  const next = page.getByRole('button', { name: 'Next' });
  await expect(next).toBeEnabled();
  await clearFakeGraphObservations();
  await next.click();
  await expect(page.getByText('5591988800051', { exact: true })).toBeVisible();
  await expect(page.getByText('5591988800001', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.getByText('5591988800001', { exact: true })).toBeVisible();

  await page.getByLabel('Phone numbers to block').fill(input);
  await page.getByRole('button', { name: 'Block', exact: true }).click();
  await expect(page.getByText('1 blocked; 1 failed')).toBeVisible();
  await expect(page.getByLabel('Phone numbers to block')).toHaveValue(input);
  const successfulRow = page.locator('li').filter({ hasText: successfulUser });
  await expect(successfulRow).toBeVisible();
  const snapshot = (await fakeGraphState()) as FakeGraphSnapshot;
  expect(snapshot.phones[FAKE.phoneId]?.blockedUsers).toContain(successfulUser);
  expect(
    snapshot.observations.some(
      (entry) =>
        entry.feature === 'blocked-users-list' &&
        entry.query.after === 'blocked-users-page-2' &&
        entry.query.limit === '50',
    ),
  ).toBe(true);
  expect(
    snapshot.observations.some(
      (entry) =>
        entry.feature === 'blocked-users-add' &&
        entry.method === 'POST' &&
        Array.isArray(entry.body?.block_users) &&
        JSON.stringify(entry.body.block_users) ===
          JSON.stringify([{ user: successfulUser }, { user: failedUser }]),
    ),
  ).toBe(true);

  await successfulRow.getByRole('button', { name: 'Unblock' }).click();
  await expect(successfulRow).toHaveCount(0);
  const afterUnblock = (await fakeGraphState()) as FakeGraphSnapshot;
  expect(afterUnblock.phones[FAKE.phoneId]?.blockedUsers).not.toContain(successfulUser);
  expect(
    afterUnblock.observations.some(
      (entry) =>
        entry.feature === 'blocked-users-remove' &&
        entry.method === 'DELETE' &&
        JSON.stringify(entry.body?.block_users) === JSON.stringify([{ user: successfulUser }]),
    ),
  ).toBe(true);
});

test('QR codes create, retrieve, update, and delete using their WhatsApp phone', async () => {
  await openPhone('QR codes', /98888 1111/);
  await expect(page.getByText('No QR codes for this number yet.')).toBeVisible();
  await clearFakeGraphObservations();
  await page.getByLabel('Suggested message').first().fill('Hello, I want to know more about Acme.');
  await page.getByRole('button', { name: 'Create QR code' }).click();
  const heading = page.getByRole('heading', { name: /^QR code QR_FAKE_/ });
  await expect(heading).toBeVisible();
  const code = (await heading.innerText()).replace('QR code ', '');
  await expect(page.getByRole('link', { name: 'Open WhatsApp chat link' })).toHaveAttribute(
    'href',
    /wa\.me\/110000000000001\?text=/,
  );

  const state = (await fakeGraphState()) as FakeGraphSnapshot;
  expect(state.phones[FAKE.phoneId]?.qrCodes).toContainEqual({
    code,
    prefilled_message: 'Hello, I want to know more about Acme.',
  });
  expect(
    state.observations.some(
      (entry) =>
        entry.feature === 'qr-create' &&
        entry.method === 'POST' &&
        entry.path === `/${FAKE.phoneId}/message_qrdls` &&
        entry.body?.prefilled_message === 'Hello, I want to know more about Acme.' &&
        entry.body?.generate_qr_image === 'PNG',
    ),
  ).toBe(true);

  await page.getByLabel('Suggested message').last().fill('Updated QR message for Acme.');
  await page.getByRole('button', { name: 'Save message' }).click();
  await expect(page.getByText('QR code updated')).toBeVisible();
  const updated = (await fakeGraphState()) as FakeGraphSnapshot;
  expect(updated.phones[FAKE.phoneId]?.qrCodes).toContainEqual({
    code,
    prefilled_message: 'Updated QR message for Acme.',
  });
  expect(
    updated.observations.some(
      (entry) =>
        entry.feature === 'qr-update' &&
        entry.method === 'POST' &&
        entry.body?.code === code &&
        entry.body?.prefilled_message === 'Updated QR message for Acme.',
    ),
  ).toBe(true);

  const row = page.locator('li').filter({ hasText: 'Updated QR message for Acme.' });
  await row.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete QR code', exact: true }).click();
  await expect(page.getByText('No QR codes for this number yet.')).toBeVisible();
  const deleted = (await fakeGraphState()) as FakeGraphSnapshot;
  expect(deleted.phones[FAKE.phoneId]?.qrCodes).toHaveLength(0);
  expect(
    deleted.observations.some(
      (entry) =>
        entry.feature === 'qr-delete' &&
        entry.method === 'DELETE' &&
        entry.path === `/${FAKE.phoneId}/message_qrdls/${code}`,
    ),
  ).toBe(true);
});

test('template builder: live preview, validation and submission', async () => {
  await home();
  await page.getByRole('link', { name: 'Templates' }).click();
  await expect(page.getByRole('cell', { name: 'order_ready' })).toBeVisible();
  await page.getByRole('link', { name: 'New template' }).click();

  await expect(page.getByRole('heading', { name: 'New template' })).toBeVisible();
  await page.getByRole('combobox', { name: 'WhatsApp account' }).click();
  await page.getByRole('option', { name: 'Acme Brasil' }).click();
  await page.getByLabel('Name').fill('Pickup Ready');
  await expect(page.getByLabel('Name')).toHaveValue('pickup_ready');

  await page.getByLabel('Body text').fill('{{1}} your order is ready');
  await expect(
    page.getByText('Text cannot start with a variable. Add text before it.').first(),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit for review' })).toBeDisabled();

  await page.getByLabel('Body text').fill('Olá {{1}}, seu pedido {{2}} está pronto!');
  await page.locator('#body-ex-1').fill('Daniel');
  await page.locator('#body-ex-2').fill('#28472');
  const bubble = page.locator('.whitespace-pre-wrap').filter({ hasText: 'seu pedido' }).first();
  await expect(bubble).toContainText('Olá Daniel, seu pedido #28472 está pronto!');

  await page.getByRole('button', { name: 'Add button' }).click();
  await page.getByRole('menuitem', { name: /Quick reply/ }).click();
  await page.getByLabel('Button text').fill('Falar com atendente');
  await expect(page.getByText('Falar com atendente').last()).toBeVisible();

  await page.getByRole('radio', { name: 'JSON' }).click();
  await expect(page.locator('.cm-content')).toContainText('"body_text"');
  await page.getByRole('radio', { name: 'Builder' }).click();

  await expect(page.getByText('Ready to submit')).toBeVisible();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByRole('heading', { name: 'pickup_ready' })).toBeVisible();
  await expect(page.getByText('Pending').first()).toBeVisible();
});

test('messaging playground shows the request, response and Meta errors', async () => {
  await page.goto(`${orgPath}/messages/playground`);
  await page.getByRole('combobox', { name: 'Phone number' }).click();
  await page.getByRole('option', { name: /98888 1111/ }).click();
  await page.getByLabel('To', { exact: true }).fill('5591999990000');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText(/wamid\.FAKE/).first()).toBeVisible();

  await page.getByLabel('To', { exact: true }).fill('0000123456');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Recipient not allowed')).toBeVisible();
  await expect(page.getByText('#131030').first()).toBeVisible();
});

test('webhook explorer lists signed deliveries and replays them', async ({ request }) => {
  await home();
  const orgId = orgPath.split('/')[2];
  const connections = await page.request.get(`/api/organizations/${orgId}/connections`).then((r) => r.json());
  const callback = new URL(connections[0].webhook.callbackUrl);

  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: FAKE.wabaId,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '559198888111', phone_number_id: FAKE.phoneId },
              contacts: [{ profile: { name: 'Marina' }, wa_id: '5591999990000' }],
              messages: [
                {
                  from: '5591999990000',
                  id: `wamid.E2E${Date.now()}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: 'Oi!' },
                },
              ],
            },
          },
        ],
      },
    ],
  });
  const signature = `sha256=${createHmac('sha256', FAKE.appSecret).update(body).digest('hex')}`;
  const res = await request.post(callback.toString(), {
    data: body,
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
  });
  expect(res.status()).toBe(200);

  await page.goto(`${orgPath}/developers/events`);
  await page.getByRole('cell', { name: 'messages.text' }).first().click();
  await expect(page.getByRole('tab', { name: 'Payload' })).toBeVisible();
  await page.getByRole('button', { name: 'Replay internally' }).click();
  await expect(page.getByText(/Replayed: Processed/)).toBeVisible();
  await page.getByRole('tab', { name: /Processing log/ }).click();
  await expect(page.getByText('Attempt 2')).toBeVisible();
});

test('inbox sends the correct typing signal and preserves drafts after Meta and HTTP failures', async ({
  request,
}) => {
  const typingWamid = await deliverInbound(request, {
    profileName: 'Typing Contact',
    waId: '5591999990000',
    message: 'Please show typing for this message.',
  });
  await page.goto(`${orgPath}/messages`);
  await expect(page.getByText('Typing Contact', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show typing', exact: true })).toBeVisible();
  await clearFakeGraphObservations();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith('/typing') &&
        response.request().method() === 'POST' &&
        response.status() === 200,
    ),
    page.getByRole('button', { name: 'Show typing', exact: true }).click(),
  ]);
  const typingState = (await fakeGraphState()) as FakeGraphSnapshot;
  expect(typingState.observations).toContainEqual(
    expect.objectContaining({
      feature: 'message-action',
      method: 'POST',
      path: `/${FAKE.phoneId}/messages`,
      body: {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: typingWamid,
        typing_indicator: { type: 'text' },
      },
    }),
  );

  await deliverInbound(request, {
    profileName: 'Meta error contact',
    waId: '0000123456',
    message: 'Test the Meta failure path.',
  });
  await page.goto(`${orgPath}/messages`);
  await expect(page.getByText('Meta error contact', { exact: true }).first()).toBeVisible();
  const metaDraft = 'Keep this draft after the Meta error.';
  await page.getByLabel('Reply').fill(metaDraft);
  await clearFakeGraphObservations();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(
    page.getByText(
      'Test numbers can only message recipients added to the allowed list in the Meta App dashboard.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByLabel('Reply')).toHaveValue(metaDraft);
  const metaFailure = (await fakeGraphState()) as FakeGraphSnapshot;
  expect(
    metaFailure.observations.some(
      (entry) =>
        entry.feature === 'message-send' &&
        entry.body?.to === '0000123456' &&
        (entry.body?.text as { body?: string } | undefined)?.body === metaDraft,
    ),
  ).toBe(true);

  const httpDraft = 'Keep this draft after the HTTP error.';
  let interceptedHttpFailure = false;
  const messagesRoute = '**/api/organizations/*/messages';
  await page.route(messagesRoute, async (route) => {
    const request = route.request();
    let payload: { payload?: { body?: string } } = {};
    try {
      payload = request.postDataJSON() as { payload?: { body?: string } };
    } catch {
      // Non-JSON requests continue to the test API.
    }
    if (request.method() === 'POST' && payload.payload?.body === httpDraft) {
      interceptedHttpFailure = true;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 503,
          error: 'Service Unavailable',
          code: 'INTERNAL_ERROR',
          message: 'Temporary test failure.',
        }),
      });
      return;
    }
    await route.continue();
  });
  await page.getByLabel('Reply').fill(httpDraft);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Could not send message')).toBeVisible();
  await expect(page.getByLabel('Reply')).toHaveValue(httpDraft);
  expect(interceptedHttpFailure).toBe(true);
  await page.unroute(messagesRoute);
});

test('visits the authenticated flow, media, analytics, and webhook GET views', async () => {
  await home();

  await page.goto(`${orgPath}/flows`);
  await expect(page.getByRole('heading', { name: 'Flows' })).toBeVisible();
  const flowRow = page.getByRole('row').filter({ hasText: 'Lead capture' });
  await expect(flowRow).toBeVisible();
  await flowRow.click();
  await expect(page.getByText('Lead capture', { exact: true }).first()).toBeVisible();

  await page.goto(`${orgPath}/media`);
  await expect(page.getByRole('heading', { name: 'Media' })).toBeVisible();
  await expect(page.getByText('No media yet')).toBeVisible();

  const templateAnalyticsResponse = page.waitForResponse(
    (response) => response.url().includes('/analytics/templates?') && response.request().method() === 'GET',
  );
  await page.goto(`${orgPath}/analytics`);
  expect((await templateAnalyticsResponse).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Template performance', exact: true })).toBeVisible();

  await page.goto(`${orgPath}/developers/webhooks`);
  await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible();

  await page.goto(`${orgPath}/developers/events`);
  await expect(page.getByRole('heading', { name: 'Event logs' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'messages.text' }).first()).toBeVisible();
});

test('switches the authenticated UI language without changing API names or form values', async () => {
  await page.goto(`${orgPath}/templates`);
  await expect(page.getByRole('cell', { name: 'order_ready', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Language', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Português (Brasil)' }).click();
  await expect(page.getByRole('heading', { name: 'Modelos de mensagem', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'order_ready', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.getByRole('heading', { name: 'Modelos de mensagem', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Novo modelo', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('preserve_language_draft');
  await page.getByRole('button', { name: 'Idioma', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'English', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'New template', exact: true })).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('preserve_language_draft');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
