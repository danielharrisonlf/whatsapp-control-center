// TEST-ONLY stand-in for graph.facebook.com used by the Playwright suite.
// The API talks to it when started with META_GRAPH_BASE_URL=http://localhost:4010.
// Responses follow the shapes documented in docs/meta-reference.md. Never use in production.
import { createServer } from 'node:http';

const PORT = Number(process.env.FAKE_GRAPH_PORT ?? 4010);
export const FAKE = {
  appId: '1234567890123',
  appSecret: '0123456789abcdef0123456789abcdef',
  token: 'EAAFAKETOKENFORTESTS0000000000000000000000000000',
  wabaId: '102030405060708',
  businessId: '908070605040302',
};

const phones = [
  {
    id: '110000000000001',
    display_phone_number: '+55 91 98888-1111',
    verified_name: 'Acme Store',
    code_verification_status: 'VERIFIED',
    quality_rating: 'GREEN',
    platform_type: 'CLOUD_API',
    throughput: { level: 'STANDARD' },
    name_status: 'APPROVED',
    status: 'CONNECTED',
    whatsapp_business_manager_messaging_limit: 'TIER_2K',
    is_official_business_account: false,
    account_mode: 'LIVE',
  },
  {
    id: '110000000000002',
    display_phone_number: '+55 91 97777-2222',
    verified_name: 'Acme Support',
    code_verification_status: 'NOT_VERIFIED',
    quality_rating: 'YELLOW',
    platform_type: 'CLOUD_API',
    throughput: { level: 'STANDARD' },
    name_status: 'PENDING_REVIEW',
    status: 'PENDING',
    whatsapp_business_manager_messaging_limit: 'TIER_250',
    is_official_business_account: false,
    account_mode: 'LIVE',
  },
];

const phoneState = new Map(
  phones.map((phone) => [
    phone.id,
    {
      commerce:
        phone.id === '110000000000001'
          ? { is_cart_enabled: true, is_catalog_visible: true }
          : { is_cart_enabled: false, is_catalog_visible: true },
      publicKey: null,
      blockedUsers: Array.from({ length: 51 }, (_, i) => `559198880${String(i + 1).padStart(4, '0')}`),
      qrCodes: [],
    },
  ]),
);
const graphObservations = [];
let qrSeq = 1;

let templateSeq = 900;
const templates = [
  {
    id: '800000000000001',
    name: 'order_ready',
    language: 'pt_BR',
    status: 'APPROVED',
    category: 'UTILITY',
    parameter_format: 'POSITIONAL',
    quality_score: { score: 'GREEN' },
    components: [
      { type: 'HEADER', format: 'TEXT', text: 'Pedido {{1}}', example: { header_text: ['#28472'] } },
      {
        type: 'BODY',
        text: 'Olá {{1}}, seu pedido {{2}} está pronto para retirada!',
        example: { body_text: [['Daniel', '#28472']] },
      },
      { type: 'FOOTER', text: 'Acme Store' },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Acompanhar',
            url: 'https://acme.test/p/{{1}}',
            example: ['https://acme.test/p/28472'],
          },
          { type: 'QUICK_REPLY', text: 'Falar com atendente' },
        ],
      },
    ],
  },
  {
    id: '800000000000002',
    name: 'spring_sale',
    language: 'en_US',
    status: 'PENDING',
    category: 'MARKETING',
    parameter_format: 'NAMED',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{first_name}}, *20% off* everything this weekend.',
        example: { body_text_named_params: [{ param_name: 'first_name', example: 'Ana' }] },
      },
      { type: 'BUTTONS', buttons: [{ type: 'COPY_CODE', example: 'SPRING20' }] },
    ],
  },
  {
    id: '800000000000003',
    name: 'account_alert',
    language: 'en_US',
    status: 'REJECTED',
    category: 'UTILITY',
    rejected_reason: 'PROMOTIONAL',
    components: [
      {
        type: 'BODY',
        text: 'Your account {{1}} has new offers waiting.',
        example: { body_text: [['ACME-1']] },
      },
    ],
  },
  {
    id: '800000000000004',
    name: 'login_code',
    language: 'en_US',
    status: 'APPROVED',
    category: 'AUTHENTICATION',
    components: [
      { type: 'BODY', add_security_recommendation: true },
      { type: 'FOOTER', code_expiration_minutes: 10 },
      { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Copy code' }] },
    ],
  },
];
const flows = [
  {
    id: '700000000000001',
    name: 'Lead capture',
    status: 'DRAFT',
    categories: ['LEAD_GENERATION'],
    validation_errors: [],
  },
];
let subscribed = true;
let msgSeq = 1;

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json', 'x-fb-trace-id': `Afake${Date.now()}` });
  res.end(JSON.stringify(body));
};
const graphError = (res, status, code, message, extra = {}) =>
  json(res, status, { error: { message, type: 'OAuthException', code, fbtrace_id: 'AfakeTrace', ...extra } });

async function readRawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function readBody(req) {
  const raw = await readRawBody(req);
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return { _raw: raw.length };
  }
}

function stateFor(phoneId) {
  let state = phoneState.get(phoneId);
  if (!state) {
    state = {
      commerce: { is_cart_enabled: false, is_catalog_visible: false },
      publicKey: null,
      blockedUsers: [],
      qrCodes: [],
    };
    phoneState.set(phoneId, state);
  }
  return state;
}

function observe(feature, method, url, body = null) {
  graphObservations.push({
    feature,
    method,
    path: url.pathname.replace(/^\/v[^/]+/, ''),
    query: Object.fromEntries(url.searchParams.entries()),
    body,
  });
  if (graphObservations.length > 500) graphObservations.shift();
}

function multipartFields(raw, contentType) {
  const fields = {};
  const boundary = contentType
    .match(/boundary=(?:"([^"]+)"|([^;]+))/i)
    ?.slice(1)
    .find(Boolean)
    ?.trim();
  if (!boundary) return fields;
  const sections = raw.split(`--${boundary}`).slice(1);
  for (const section of sections) {
    if (section.startsWith('--')) continue;
    const separator = section.indexOf('\r\n\r\n');
    if (separator < 0) continue;
    const headers = section.slice(0, separator);
    const name = headers.match(/Content-Disposition: form-data; name="([^"]+)"/i)?.[1];
    if (!name) continue;
    const value = section.slice(separator + 4).replace(/\r\n$/, '');
    fields[name] = value;
  }
  return fields;
}

function validFields(url, expected) {
  return (
    url.searchParams.get('fields') === expected &&
    [...url.searchParams.keys()].every((key) => key === 'fields')
  );
}

function qrDto(phoneId, qr) {
  return {
    ...qr,
    deep_link_url: `https://wa.me/${phoneId}?text=${encodeURIComponent(qr.prefilled_message)}`,
    qr_image_url: null,
  };
}

function page(items) {
  return { data: items, paging: { cursors: { before: 'b', after: 'a' } } };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === '/__test/state' && req.method === 'GET') {
    return json(res, 200, {
      phones: Object.fromEntries(
        [...phoneState.entries()].map(([id, state]) => [id, structuredClone(state)]),
      ),
      observations: structuredClone(graphObservations),
    });
  }
  if (url.pathname === '/__test/observations' && req.method === 'DELETE') {
    graphObservations.length = 0;
    return json(res, 200, { success: true });
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0]?.startsWith('v')) parts.shift();
  const [a, b] = parts;
  const auth = req.headers.authorization ?? '';
  const method = req.method;
  const contentType = String(req.headers['content-type'] ?? '');
  const isMultipart = contentType.startsWith('multipart/form-data');
  const rawBody = (method === 'POST' || method === 'DELETE') && isMultipart ? await readRawBody(req) : '';
  const body = (method === 'POST' || method === 'DELETE') && !isMultipart ? await readBody(req) : {};

  if (a === 'oauth' && b === 'access_token')
    return json(res, 200, { access_token: FAKE.token, token_type: 'bearer' });
  if (a === 'debug_token') {
    const valid = url.searchParams.get('input_token') === FAKE.token;
    return json(res, 200, {
      data: {
        app_id: FAKE.appId,
        type: 'SYSTEM_USER',
        application: 'Acme WhatsApp',
        is_valid: valid,
        expires_at: 0,
        scopes: ['whatsapp_business_management', 'whatsapp_business_messaging', 'business_management'],
        granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: [FAKE.wabaId] }],
      },
    });
  }
  if (
    auth !== `Bearer ${FAKE.token}` &&
    auth !== `Bearer ${FAKE.appId}|${FAKE.appSecret}` &&
    auth !== `OAuth ${FAKE.token}`
  ) {
    return graphError(res, 401, 190, 'Invalid OAuth access token - Cannot parse access token');
  }
  if (a === FAKE.appId && !b) return json(res, 200, { id: FAKE.appId, name: 'Acme WhatsApp' });
  if (a === FAKE.appId && b === 'uploads') return json(res, 200, { id: 'upload:fake-session' });
  if (a?.startsWith('upload:')) return json(res, 200, { h: '4::aW1hZ2UvanBlZw==:fakehandle' });

  if (a === FAKE.wabaId) {
    if (!b) {
      const fields = url.searchParams.get('fields') ?? '';
      if (fields.startsWith('analytics')) {
        const now = Math.floor(Date.now() / 1000);
        return json(res, 200, {
          analytics: {
            data_points: Array.from({ length: 7 }, (_, i) => ({
              start: now - (7 - i) * 86400,
              end: now - (6 - i) * 86400,
              sent: 40 + i * 7,
              delivered: 36 + i * 6,
            })),
          },
        });
      }
      if (fields.startsWith('pricing_analytics')) {
        const now = Math.floor(Date.now() / 1000);
        return json(res, 200, {
          pricing_analytics: {
            data: [
              {
                data_points: [
                  {
                    start: now - 86400,
                    end: now,
                    volume: 120,
                    cost: 1.32,
                    pricing_category: 'UTILITY',
                    pricing_type: 'REGULAR',
                  },
                  {
                    start: now - 86400,
                    end: now,
                    volume: 45,
                    cost: 2.81,
                    pricing_category: 'MARKETING',
                    pricing_type: 'REGULAR',
                  },
                  {
                    start: now - 86400,
                    end: now,
                    volume: 300,
                    cost: 0,
                    pricing_category: 'SERVICE',
                    pricing_type: 'FREE_CUSTOMER_SERVICE',
                  },
                ],
              },
            ],
          },
        });
      }
      return json(res, 200, {
        id: FAKE.wabaId,
        name: 'Acme Brasil',
        timezone_id: '25',
        currency: 'USD',
        message_template_namespace: 'f1e2d3c4_b5a6_4789_9012_abcdef123456',
        account_review_status: 'APPROVED',
        business_verification_status: 'VERIFIED',
        ownership_type: 'SELF',
        status: 'ACTIVE',
        country: 'BR',
        is_enabled_for_insights: true,
        owner_business_info: { id: FAKE.businessId, name: 'Acme Holdings' },
        health_status: { can_send_message: 'AVAILABLE', entities: [] },
      });
    }
    if (b === 'subscribed_apps') {
      if (method === 'POST') subscribed = true;
      if (method === 'DELETE') subscribed = false;
      if (method !== 'GET') return json(res, 200, { success: true });
      return json(res, 200, {
        data: subscribed
          ? [
              {
                whatsapp_business_api_data: {
                  id: FAKE.appId,
                  name: 'Acme WhatsApp',
                  link: 'https://acme.test',
                },
              },
            ]
          : [],
      });
    }
    if (b === 'phone_numbers') {
      if (method === 'POST') {
        const p = {
          ...phones[1],
          id: `1100000000${String(Date.now()).slice(-5)}`,
          display_phone_number: `+${body.cc} ${body.phone_number}`,
          verified_name: body.verified_name,
          code_verification_status: 'NOT_VERIFIED',
          status: 'PENDING',
        };
        phones.push(p);
        return json(res, 200, { id: p.id });
      }
      return json(res, 200, page(phones));
    }
    if (b === 'message_templates') {
      if (method === 'POST') {
        const t = { id: String(++templateSeq).padStart(15, '8'), status: 'PENDING', ...body };
        templates.push(t);
        return json(res, 200, { id: t.id, status: 'PENDING', category: body.category });
      }
      if (method === 'DELETE') {
        const name = url.searchParams.get('name');
        for (let i = templates.length - 1; i >= 0; i--)
          if (templates[i].name === name) templates.splice(i, 1);
        return json(res, 200, { success: true });
      }
      return json(res, 200, page(templates));
    }
    if (b === 'flows') return json(res, 200, page(flows));
    if (b === 'template_analytics') {
      const now = Math.floor(Date.now() / 1000);
      return json(res, 200, {
        data: [
          {
            data_points: [
              {
                template_id: '800000000000001',
                start: now - 86400,
                end: now,
                sent: 120,
                delivered: 115,
                read: 90,
                clicked: [{ type: 'url_button', count: 31 }],
              },
            ],
          },
        ],
      });
    }
  }

  const phone = phones.find((p) => p.id === a);
  if (phone) {
    const state = stateFor(phone.id);
    if (!b) {
      if (method === 'POST') return json(res, 200, { success: true });
      return json(res, 200, phone);
    }
    if (b === 'messages') {
      if (body.status === 'read') {
        const keys = Object.keys(body).sort().join(',');
        const expected = body.typing_indicator
          ? 'message_id,messaging_product,status,typing_indicator'
          : 'message_id,messaging_product,status';
        if (
          method !== 'POST' ||
          keys !== expected ||
          body.messaging_product !== 'whatsapp' ||
          typeof body.message_id !== 'string' ||
          (body.typing_indicator && body.typing_indicator.type !== 'text')
        ) {
          return graphError(res, 400, 100, 'Invalid messages read/typing request');
        }
        observe('message-action', method, url, body);
        return json(res, 200, { success: true });
      }
      const sendKeys = Object.keys(body).sort().join(',');
      const expectedSendKeys = body.context
        ? 'context,messaging_product,recipient_type,text,to,type'
        : 'messaging_product,recipient_type,text,to,type';
      const textKeys = Object.keys(body.text ?? {})
        .sort()
        .join(',');
      if (
        method !== 'POST' ||
        [...url.searchParams.keys()].length ||
        sendKeys !== expectedSendKeys ||
        body.messaging_product !== 'whatsapp' ||
        body.recipient_type !== 'individual' ||
        !/^\+?\d{6,20}$/.test(String(body.to ?? '')) ||
        body.type !== 'text' ||
        !body.text ||
        !['body', 'body,preview_url'].includes(textKeys) ||
        typeof body.text.body !== 'string' ||
        body.text.body.length === 0 ||
        (body.text.preview_url !== undefined && typeof body.text.preview_url !== 'boolean') ||
        (body.context &&
          (Object.keys(body.context).join(',') !== 'message_id' ||
            typeof body.context.message_id !== 'string'))
      ) {
        return graphError(res, 400, 100, 'Invalid messages send request');
      }
      observe('message-send', method, url, body);
      if (String(body.to).startsWith('0000'))
        return graphError(res, 400, 131030, '(#131030) Recipient phone number not in allowed list', {
          error_data: {
            messaging_product: 'whatsapp',
            details:
              'Recipient phone number not in allowed list: Add recipient phone number to recipient list and try again.',
          },
        });
      return json(res, 200, {
        messaging_product: 'whatsapp',
        contacts: [{ input: body.to, wa_id: body.to }],
        messages: [{ id: `wamid.FAKE${String(msgSeq++).padStart(6, '0')}`, message_status: 'accepted' }],
      });
    }
    if (b === 'whatsapp_commerce_settings') {
      if (method === 'GET') {
        if ([...url.searchParams.keys()].length)
          return graphError(res, 400, 100, 'Commerce GET does not accept query parameters');
        observe('commerce-read', method, url);
        return json(res, 200, { data: [state.commerce] });
      }
      if (method !== 'POST') return graphError(res, 400, 100, 'Commerce settings require GET or POST');
      const keys = [...url.searchParams.keys()].sort().join(',');
      if (
        keys !== 'is_cart_enabled,is_catalog_visible' ||
        !['true', 'false'].includes(url.searchParams.get('is_cart_enabled')) ||
        !['true', 'false'].includes(url.searchParams.get('is_catalog_visible')) ||
        Object.keys(body).length
      ) {
        return graphError(
          res,
          400,
          100,
          'Commerce updates require both boolean settings as query parameters',
        );
      }
      state.commerce = {
        is_cart_enabled: url.searchParams.get('is_cart_enabled') === 'true',
        is_catalog_visible: url.searchParams.get('is_catalog_visible') === 'true',
      };
      observe('commerce-update', method, url, state.commerce);
      return json(res, 200, { success: true });
    }
    if (b === 'whatsapp_business_encryption') {
      if (method === 'GET') {
        if ([...url.searchParams.keys()].length)
          return graphError(res, 400, 100, 'Encryption GET does not accept query parameters');
        observe('encryption-read', method, url);
        return json(res, 200, {
          data: state.publicKey
            ? [{ business_public_key: state.publicKey, business_public_key_signature_status: 'VALID' }]
            : [],
        });
      }
      if (method !== 'POST' || [...url.searchParams.keys()].length || !isMultipart) {
        return graphError(res, 400, 100, 'Encryption key must be uploaded as multipart form data');
      }
      const fields = multipartFields(rawBody, contentType);
      if (
        Object.keys(fields).join(',') !== 'business_public_key' ||
        !/^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----$/.test(fields.business_public_key ?? '')
      ) {
        return graphError(res, 400, 100, 'Expected one valid public key PEM field');
      }
      state.publicKey = fields.business_public_key;
      observe('encryption-update', method, url, fields);
      return json(res, 200, { success: true });
    }
    if (b === 'block_users') {
      if (method === 'GET') {
        const keys = [...url.searchParams.keys()].sort().join(',');
        const after = url.searchParams.get('after');
        const limit = url.searchParams.get('limit');
        if (
          (keys !== 'limit' && keys !== 'after,limit') ||
          limit !== '50' ||
          (after && after !== 'blocked-users-page-2')
        ) {
          return graphError(res, 400, 100, 'Blocked users requires limit=50 and a valid cursor');
        }
        const offset = after ? 50 : 0;
        const items = state.blockedUsers.slice(offset, offset + 50).map((wa_id) => ({ wa_id }));
        const hasNext = offset + items.length < state.blockedUsers.length;
        observe('blocked-users-list', method, url);
        return json(res, 200, {
          data: items,
          paging: {
            ...(hasNext ? { next: `${url.pathname}?limit=50&after=blocked-users-page-2` } : {}),
            cursors: { ...(hasNext ? { after: 'blocked-users-page-2' } : {}) },
          },
        });
      }
      if (method !== 'POST' && method !== 'DELETE') {
        return graphError(res, 400, 100, 'Blocked users changes require POST or DELETE');
      }
      if (
        [...url.searchParams.keys()].length ||
        body.messaging_product !== 'whatsapp' ||
        !Array.isArray(body.block_users) ||
        !body.block_users.length ||
        Object.keys(body).sort().join(',') !== 'block_users,messaging_product' ||
        body.block_users.some(
          (item) => !item || Object.keys(item).join(',') !== 'user' || !/^\+?\d{6,20}$/.test(item.user),
        )
      ) {
        return graphError(res, 400, 100, 'Invalid block_users request payload');
      }
      const users = body.block_users.map((item) => item.user.replace(/^\+/, ''));
      const failedUser = '5591777700002';
      const failedUsers = users
        .filter((user) => user === failedUser)
        .map((user) => ({ input: user, error: 'Unable to block this contact' }));
      const successfulUsers = users.filter((user) => user !== failedUser);
      if (method === 'POST') {
        state.blockedUsers = [...new Set([...successfulUsers, ...state.blockedUsers])];
      } else {
        state.blockedUsers = state.blockedUsers.filter((user) => !successfulUsers.includes(user));
      }
      observe(method === 'POST' ? 'blocked-users-add' : 'blocked-users-remove', method, url, body);
      return json(res, 200, {
        block_users: {
          ...(method === 'POST'
            ? { added_users: successfulUsers.map((input) => ({ input, wa_id: input })) }
            : { removed_users: successfulUsers.map((input) => ({ input, wa_id: input })) }),
          failed_users: failedUsers,
        },
      });
    }
    if (b === 'message_qrdls') {
      const fields = 'code,prefilled_message,deep_link_url,qr_image_url.format(PNG)';
      if (method === 'GET' && !parts[2]) {
        const after = url.searchParams.get('after');
        const keys = [...url.searchParams.keys()].sort().join(',');
        if (
          url.searchParams.get('fields') !== fields ||
          !['fields,limit', 'after,fields,limit'].includes(keys) ||
          url.searchParams.get('limit') !== '100' ||
          (after && after !== 'qr-codes-page-2')
        ) {
          return graphError(res, 400, 100, 'QR code list requires the documented fields and pagination');
        }
        const offset = after ? 100 : 0;
        const rows = state.qrCodes.slice(offset, offset + 100);
        const hasNext = offset + rows.length < state.qrCodes.length;
        observe('qr-list', method, url);
        return json(res, 200, {
          data: rows.map((qr) => qrDto(phone.id, qr)),
          paging: {
            ...(hasNext
              ? {
                  next: `${url.pathname}?fields=${encodeURIComponent(fields)}&limit=100&after=qr-codes-page-2`,
                }
              : {}),
            cursors: { ...(hasNext ? { after: 'qr-codes-page-2' } : {}) },
          },
        });
      }
      if (method === 'GET' && parts[2]) {
        const code = decodeURIComponent(parts[2]);
        if (!validFields(url, fields))
          return graphError(res, 400, 100, 'QR code detail requires the documented fields');
        const qr = state.qrCodes.find((item) => item.code === code);
        observe('qr-get', method, url);
        return qr
          ? json(res, 200, { data: [qrDto(phone.id, qr)] })
          : graphError(res, 404, 100, 'Unknown QR code');
      }
      if (method === 'POST' && !parts[2]) {
        if ([...url.searchParams.keys()].length)
          return graphError(res, 400, 100, 'QR code mutations do not accept query parameters');
        if (
          Object.keys(body).sort().join(',') === 'generate_qr_image,prefilled_message' &&
          typeof body.prefilled_message === 'string' &&
          body.prefilled_message.length > 0 &&
          ['PNG', 'SVG'].includes(body.generate_qr_image)
        ) {
          const qr = { code: `QR_FAKE_${qrSeq++}`, prefilled_message: body.prefilled_message };
          state.qrCodes.unshift(qr);
          observe('qr-create', method, url, body);
          return json(res, 200, qrDto(phone.id, qr));
        }
        if (
          Object.keys(body).sort().join(',') === 'code,prefilled_message' &&
          typeof body.code === 'string' &&
          typeof body.prefilled_message === 'string' &&
          body.prefilled_message.length > 0
        ) {
          const qr = state.qrCodes.find((item) => item.code === body.code);
          if (!qr) return graphError(res, 404, 100, 'Unknown QR code');
          qr.prefilled_message = body.prefilled_message;
          observe('qr-update', method, url, body);
          return json(res, 200, qrDto(phone.id, qr));
        }
        return graphError(res, 400, 100, 'QR code create/update requires the documented fields');
      }
      if (method === 'DELETE' && parts[2]) {
        if ([...url.searchParams.keys()].length)
          return graphError(res, 400, 100, 'QR code delete does not accept query parameters');
        const code = decodeURIComponent(parts[2]);
        const index = state.qrCodes.findIndex((item) => item.code === code);
        if (index < 0) return graphError(res, 404, 100, 'Unknown QR code');
        state.qrCodes.splice(index, 1);
        observe('qr-delete', method, url);
        return json(res, 200, { success: true });
      }
      return graphError(res, 400, 100, 'Unsupported QR code method');
    }
    if (b === 'whatsapp_business_profile') {
      if (method === 'POST') return json(res, 200, { success: true });
      return json(res, 200, {
        data: [
          {
            about: 'Pedidos e suporte',
            description: 'Loja de exemplo.',
            email: 'contato@acme.test',
            websites: ['https://acme.test'],
            vertical: 'RETAIL',
            messaging_product: 'whatsapp',
          },
        ],
      });
    }
    if (['request_code', 'verify_code', 'register', 'deregister'].includes(b)) {
      if (b === 'verify_code') phone.code_verification_status = 'VERIFIED';
      if (b === 'register') phone.status = 'CONNECTED';
      if (b === 'deregister') phone.status = 'PENDING';
      return json(res, 200, { success: true });
    }
    if (b === 'media') return json(res, 200, { id: `55500000${msgSeq++}` });
  }
  const template = templates.find((t) => t.id === a);
  if (template) return method === 'POST' ? json(res, 200, { success: true }) : json(res, 200, template);
  const flow = flows.find((f) => f.id === a);
  if (flow) {
    if (b === 'assets')
      return method === 'POST'
        ? json(res, 200, { success: true, validation_errors: [] })
        : json(res, 200, { data: [] });
    if (b === 'publish') {
      flow.status = 'PUBLISHED';
      return json(res, 200, { success: true });
    }
    return json(res, 200, { ...flow, json_version: '7.2', data_api_version: '3.0' });
  }
  return graphError(
    res,
    400,
    100,
    `Unsupported request - method type: ${method.toLowerCase()} ${url.pathname}`,
  );
});

server.listen(PORT, () => console.log(`Fake Graph API (tests only) on :${PORT}`));
