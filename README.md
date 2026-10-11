# WhatsApp Cloud API Control Center

A control panel for the **WhatsApp Business Platform (Cloud API)**: connect Meta, then manage WhatsApp Business Accounts, phone numbers, business profiles, message templates (with a live WhatsApp preview), flows, media, messages and webhooks in one place, with diagnostics that say exactly what is wrong.

Everything external goes through the official **Meta Graph API** (version set by `META_GRAPH_API_VERSION`, `v26.0` as of October 2026). Nothing is simulated: when Meta does not expose an operation, the UI says so and links to WhatsApp Manager.

- **Backend:** NestJS 11, Prisma 6, PostgreSQL 17, Zod (validation + OpenAPI), Swagger at `/docs`
- **Frontend:** React 19 + Vite 7 SPA, React Router 7, TanStack Query 5, React Hook Form, Tailwind CSS 4, Radix UI primitives (shadcn-style components), Lucide icons
- **Monorepo:** pnpm workspaces + Turborepo, Biome for lint/format, Docker Compose for local development

The interface defaults to Brazilian Portuguese. Select **PT-BR / EN** on the sign-in screen or in the application header to switch languages; the choice persists in the browser. Dates, numbers, validation messages and status labels follow the selected language. Light, dark and system themes remain available, with a one-click light/dark shortcut. Names and message content returned by the API retain their original values.

---

## Contents

- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation](#installation)
- [Environment variables](#environment-variables)
- [Docker setup](#docker-setup)
- [Database migrations](#database-migrations)
- [Development](#development)
- [Testing](#testing)
- [Meta configuration](#meta-configuration)
  - [How to configure a Meta App](#how-to-configure-a-meta-app)
  - [Embedded Signup](#embedded-signup)
  - [Webhook setup](#webhook-setup)
  - [Required Meta permissions](#required-meta-permissions)
- [Production deployment](#production-deployment)
- [Security model](#security-model)
- [What is (and is not) possible through the API](#what-is-and-is-not-possible-through-the-api)

---

## Architecture

```text
apps/
  api/                 NestJS API (REST + OpenAPI), webhooks, Meta integration
    prisma/            Schema and migrations
    src/
      common/          Secrets (AES-GCM), sanitization, errors, pagination, request context
      config/          Zod-validated environment
      modules/
        meta/          ← the only code that talks to Meta: MetaGraphClient + typed services
        auth/          Email/password, rotating refresh tokens, global access guard (RBAC)
        organizations/ Orgs, members, invitations
        connections/   Embedded Signup, manual setup, credential resolution, Meta→local sync, diagnostics
        wabas/ phone-numbers/ templates/ messages/ media/ flows/
        webhooks/      Public receiver (signature check), processor, event explorer, replay, health
        analytics/     Dashboard (local data) + Meta messaging/pricing/template analytics
        api-logs/ audit/ health/
    test/              Integration + e2e (real PostgreSQL)
  www/                 React + Vite SPA
    src/features/      One folder per area (templates, phones, developers, ...)
    e2e/               Playwright suite + test-only fake Graph API server
packages/
  types/               Shared domain: Meta enums, template rules (validation, payload builder), RBAC, capabilities, error hints
  api-client/          Generated from the API's OpenAPI with Orval: typed fetchers + TanStack Query hooks
  ui/                  Design-system primitives (Button, Select, Dialog, Table, Badge, ...)
  config/              Shared TypeScript configs
docs/meta-reference.md Graph API reference notes (endpoints, fields, limits) used to build the integration
```

Key decisions:

- **One Graph client.** `MetaGraphClient` owns the versioned base URL, auth headers, timeouts, retries (exponential backoff with full jitter, only for transient errors; POSTs that may have executed are never retried), error normalization, cursor pagination, `X-Business-Use-Case-Usage` throttling and sanitized request logging.
- **Shared rules.** Template validation lives in `@wacc/types` and runs both in the builder (instant feedback) and in the API (authoritative check before calling Meta).
- **Meta is the source of truth.** Local tables cache Meta state for fast lists and history. Syncs update Meta-owned fields and never touch local ones (labels, creator, history). Templates deleted outside the app are kept with `remoteDeletedAt`.
- **End-to-end types.** Zod schemas → OpenAPI (`apps/api/openapi.json`) → Orval → React hooks (`useListTemplates`, `useSendMessage`, ...). Responses are serialized through the same schemas, so columns like ciphertexts can never leak.
- **Multi-tenant by URL, verified on the server.** Every route under `/organizations/:organizationId` checks the caller's membership; the ID in the URL is never trusted on its own.

## Requirements

- Node.js 22+ (24 works) and pnpm 10 (`corepack enable`)
- Docker (for PostgreSQL, or the whole stack)
- A Meta developer account and a Meta app to connect real WhatsApp accounts

## Installation

```bash
git clone <repo> && cd <repo>
corepack enable
pnpm install
cp .env.example .env
# Generate the two required secrets and paste them into .env:
openssl rand -base64 48   # AUTH_SECRET
openssl rand -base64 32   # SECRETS_ENCRYPTION_KEY
```

## Environment variables

All variables live in the repository root `.env` (read by the API, Vite and Docker Compose). See `.env.example` for the full list with comments.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `AUTH_SECRET` | yes | HMAC key for access tokens (≥32 chars) |
| `SECRETS_ENCRYPTION_KEY` | yes | 32-byte base64 key for AES-256-GCM encryption of Meta tokens and app secrets. **Losing it makes stored tokens unreadable.** |
| `SECRETS_ENCRYPTION_KEY_ID` | no | Key identifier stored with each ciphertext (rotation support) |
| `META_GRAPH_API_VERSION` | yes | e.g. `v26.0`. The only place the version is set |
| `API_PUBLIC_URL` | yes | Public base URL of the API; webhook callback URLs are derived from it |
| `WEB_URL` | yes | Web origin (CORS and CSRF origin check) |
| `BROWSER_API_BASE_PATH` | no | Path under which the browser reaches the API (`/api`) |
| `META_APP_ID`, `META_APP_SECRET`, `META_EMBEDDED_SIGNUP_CONFIG_ID` | for Embedded Signup | Platform Meta app |
| `META_WEBHOOK_VERIFY_TOKEN` | for platform webhooks | Verify token of `/webhooks/meta` |
| `META_GRAPH_TIMEOUT_MS`, `META_GRAPH_MAX_RETRIES` | no | Graph client tuning |
| `AUTH_ALLOW_SIGNUP` | no | Disable self sign-up after the first owner exists |
| `API_LOG_BODIES` | no | Store sanitized bodies in API logs |
| `TRUST_PROXY` | no | `true` behind a reverse proxy |

No real secret is committed: `.env*` files except `.env.example` are git-ignored.

## Docker setup

```bash
docker compose up
```

| Service | URL | Notes |
|---|---|---|
| `www` | http://localhost:5173 | Vite dev server with HMR; proxies `/api` to the API |
| `api` | http://localhost:3000 (Swagger at `/docs`) | Nest in watch mode; applies migrations on start |
| `postgres` | localhost:5432 | Data in the `pg_data` volume |
| `setup` | one-shot | Installs dependencies (Linux binaries) into named volumes and builds `@wacc/types` |

Source is bind-mounted, `node_modules` live in named volumes, and file watching uses polling, so hot reload works on Docker Desktop (Windows/macOS). If a port is taken on your machine, change `POSTGRES_PORT`, `API_PORT` or `WEB_PORT` in `.env`.

## Database migrations

```bash
pnpm db:migrate              # create/apply a migration in development (prisma migrate dev)
pnpm db:deploy               # apply pending migrations (CI/production)
pnpm --filter @wacc/api prisma:studio
```

Docker Compose and the production image run `prisma migrate deploy` automatically on start.

## Development

Without Docker for the apps (PostgreSQL still from Compose):

```bash
docker compose up -d postgres
pnpm db:deploy
pnpm dev                     # turbo: types (watch), api (watch) and www (vite)
```

Useful commands:

```bash
pnpm lint                    # Biome
pnpm typecheck               # all packages
pnpm build
pnpm api:generate            # export OpenAPI from the API and regenerate packages/api-client
```

After changing an API DTO or route, run `pnpm api:generate`; the frontend gets the new types and hooks.

## Testing

| Suite | Command | What it covers |
|---|---|---|
| Shared rules | `pnpm --filter @wacc/types test` | Template validation, payload building, send parameters |
| API unit | `pnpm --filter @wacc/api test` | AES-GCM secrets, sanitization, Graph client retries/pagination/throttling, error parsing, webhook signatures, auth tokens, passwords |
| API integration | `pnpm --filter @wacc/api test:integration` | Webhook processor against PostgreSQL: out-of-order statuses, cross-org isolation, template events |
| API e2e | `pnpm --filter @wacc/api test:e2e` | Full Nest app + PostgreSQL: auth, refresh rotation and reuse detection, CSRF, RBAC, membership isolation, manual connection, templates, messaging errors, signed webhooks, replay, no secrets in logs |
| Web unit | `pnpm --filter @wacc/www test` | WhatsApp formatting, preview model, error display |
| Web e2e (Playwright) | `pnpm --filter @wacc/api build && pnpm --filter @wacc/www test:e2e` | Sign up, connect, WABA, phones, template builder + live preview, playground, webhook explorer |

Integration and e2e suites use a dedicated database named `<db>_test` (created automatically; the setup refuses any database whose name does not end in `_test`). PostgreSQL must be running.

Where real Meta credentials are unavailable, the tests use `apps/www/e2e/fake-graph.mjs`, a **test-only** stand-in for `graph.facebook.com` selected through `META_GRAPH_BASE_URL`. Production code always talks to Meta.

## Meta configuration

### How to configure a Meta App

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Create app** → type **Business**, linked to your business portfolio.
2. Add the **WhatsApp** product. Meta creates a test WABA and a test phone number you can use right away.
3. **App settings → Basic:** copy the **App ID** and **App secret**.
4. Create a **system user** token (do not use the temporary user token from the API Setup page; it expires in 24 hours):
   1. [Business settings → System users](https://business.facebook.com/settings/system-users) → **Add** an admin system user.
   2. **Assign assets:** the app (full control) and the WhatsApp account(s) (full control).
   3. **Generate token** for the app with `whatsapp_business_management`, `whatsapp_business_messaging` (and optionally `business_management`). Choose "Never" for expiry or plan rotation.
5. In this app: **Connect WhatsApp → Advanced: manual setup**, paste App ID, App secret, token and WABA ID (WhatsApp Manager → Account tools, or the API Setup page). The API validates everything with Meta (`/debug_token`, the WABA itself) before saving.
6. Configure the webhook (next sections), then open **Developers → Diagnostics → Test Meta connection**.

To send to real customers you also need: a verified business (Business settings → Security center), an approved display name, and a payment method in WhatsApp Manager. With the test number you can only message phone numbers added to the allowed list on the API Setup page (error `131030` otherwise).

### Embedded Signup

Embedded Signup lets your customers connect their own WhatsApp accounts to your app through a Meta-hosted flow. It requires a Meta app that is a **Tech Provider** (or a Solution Partner) and **Facebook Login for Business**.

1. App dashboard → **Facebook Login for Business → Configurations → Create configuration**, choose the **WhatsApp Embedded Signup** template (version **v4**; v2 is deprecated on 2026-10-15), and select the assets and permissions above. Copy the **configuration ID**.
2. Under **Facebook Login for Business → Settings**, add your web origin to *Allowed domains* / *Valid OAuth redirect URIs* (HTTPS in production).
3. Set `META_APP_ID`, `META_APP_SECRET` and `META_EMBEDDED_SIGNUP_CONFIG_ID`, restart the API.
4. **Connect WhatsApp → Connect with Meta.** The SDK popup returns a `code` (valid for about 30 seconds) plus the selected `waba_id` / `phone_number_id`. The API exchanges the code (`GET /oauth/access_token`), inspects the token (`/debug_token` and its `granular_scopes`), subscribes the app to each granted WABA (`POST /{waba-id}/subscribed_apps`) and syncs numbers, templates and flows.
5. If the number is not registered yet, finish in **Phone numbers → Register** (6-digit PIN). Billing is set by the customer in WhatsApp Manager.

### Webhook setup

There are two kinds of endpoints:

| Endpoint | Used by | Secrets |
|---|---|---|
| `{API_PUBLIC_URL}/webhooks/meta` | Connections made through Embedded Signup (platform app) | `META_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET` |
| `{API_PUBLIC_URL}/webhooks/meta/c/{key}` | Each manual connection (its own app) | Generated verify token (reveal it in **Developers → Webhooks**, audited) and the connection's app secret |

1. Meta must reach the URL over **public HTTPS**. Locally, use a tunnel (ngrok, Cloudflare Tunnel) and set `API_PUBLIC_URL` to it.
2. App dashboard → **WhatsApp → Configuration → Webhook → Edit**: paste the callback URL and verify token. Meta calls `GET ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…`; the API echoes the challenge only when the token matches.
3. Subscribe to the webhook fields. **Developers → Webhooks** lists them; at least `messages`, `message_template_status_update`, `message_template_quality_update`, `template_category_update`, `phone_number_quality_update`, `phone_number_name_update`, `account_update`, `account_review_update` and `flows`.
4. Make sure each WABA has the app subscribed (`subscribed_apps`); the WABA page and the Webhooks page have a **Subscribe app** button.
5. Run **Webhook health → Run diagnostics**: it calls your public callback URL like Meta does, checks the verify token, signature setup, WABA subscriptions and recent errors.

Every POST is verified with `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the app secret). Invalid signatures are answered with 403, stored as `REJECTED`, and never processed. Valid deliveries are stored first, acknowledged immediately, then processed idempotently (Meta retries for days). The **Event logs** page shows payload, headers, processing log and related messages, and can **replay** a stored event through our handler (it never asks Meta to resend).

### Required Meta permissions

| Permission | Needed for |
|---|---|
| `whatsapp_business_management` | WABAs, phone numbers, business profile, templates, flows, analytics, webhook subscriptions |
| `whatsapp_business_messaging` | Sending messages, media, phone registration, read receipts |
| `business_management` | Optional: discovering WABAs owned by/shared with a business portfolio |

The API stores the scopes reported by `/debug_token`. Missing permissions disable the corresponding actions in the UI and are named explicitly in diagnostics ("`whatsapp_business_management` permission missing"). Using these permissions with other businesses' assets requires App Review (Advanced Access).

## Production deployment

Images:

```bash
docker build -f apps/api/Dockerfile -t wacc-api .   # Nest API, runs migrations on start, non-root, dumb-init
docker build -f apps/www/Dockerfile -t wacc-www .   # nginx serving the SPA, proxies /api and /webhooks
```

`docker-compose.prod.yml` wires PostgreSQL, API and web together (`--env-file .env.production`).

Checklist:

- Serve everything from one HTTPS origin (the web container proxies `/api/*` and `/webhooks/*`), set `WEB_URL` and `API_PUBLIC_URL` to that origin, `TRUST_PROXY=true`, `NODE_ENV=production` (cookies become `Secure`).
- Store `AUTH_SECRET` and `SECRETS_ENCRYPTION_KEY` in your secret manager. `SecretService` is an abstraction; implement it with AWS KMS/Secrets Manager, Vault or GCP Secret Manager and register it in `SecretsModule` to move key custody out of the environment.
- Set `AUTH_ALLOW_SIGNUP=false` after creating the first owner; invite everyone else.
- Run more than one API replica only behind a shared rate-limit store (the built-in throttler and the Graph BUC throttle map are in-memory).
- Back up PostgreSQL. Message history, webhook events and audit logs exist only there.
- `/health` is liveness (does not depend on Meta), `/health/ready` checks PostgreSQL.

## Security model

- **Sessions:** email + password (scrypt N=2^17), 15-minute signed access cookie + 30-day rotating refresh cookie, both HttpOnly and SameSite=Lax (Secure in production). Refresh-token reuse revokes the session. Login and sign-up are rate limited.
- **CSRF:** state-changing requests carrying session cookies must come from `WEB_URL` (Origin/Referer check).
- **RBAC:** OWNER, ADMIN, DEVELOPER, VIEWER. The minimum role per action is defined once in `@wacc/types` (`ACTION_MIN_ROLE`), enforced by the API guard and used by the UI to hide or disable actions.
- **Secrets at rest:** Meta tokens, app secrets and generated verify tokens are encrypted with AES-256-GCM; the record id is bound as additional authenticated data, so a ciphertext copied elsewhere does not decrypt. Only masked previews (`EAAJ•••••••93A`) are ever returned.
- **Logs:** request/response bodies in API logs, audit metadata and Meta error `raw` objects go through one sanitizer that redacts tokens, secrets, PINs, verification codes and verify tokens (by key and by pattern).

## What is (and is not) possible through the API

Supported here through the official API: listing/syncing WABAs and numbers, adding numbers, requesting/verifying codes, register/deregister, two-step PIN, business profile (including photo via the Resumable Upload API), templates (create, edit within Meta's limits, delete, status/quality/rejection reason), sending text, template, media, location, contact, reaction and interactive messages, read receipts and typing indicators, media upload/download/delete, flows (create, JSON upload with validation errors, preview, publish, deprecate, delete drafts), webhook subscription, messaging/pricing/template analytics.

**Phone number details** also includes commerce settings (catalog visibility and cart), Flow data-exchange public-key configuration, paginated blocked users with block/unblock and partial-failure reporting, QR code creation/read/update/delete, and an internal label. RSA private keys stay on your Flow endpoint; this application accepts only a public 2048-bit RSA PEM key.

See [the endpoint coverage and review report](docs/whatsapp-endpoint-coverage.md) for the exact local routes, their UI entry points and unsupported API families. OpenAPI and the generated React client are regenerated together with `pnpm api:generate`.

Done in **Meta Business Manager / WhatsApp Manager** (the UI links there): business verification, payment methods, display name changes and appeals, template rejection appeals, disabling two-step verification or resetting a lost PIN, deleting phone numbers, official business account requests.

Limitations to know:

- Calling, Groups, regional Payments, partner billing and conversational automation are not implemented. These require separate contracts and, where applicable, account eligibility. This panel does not claim universal coverage of every Meta product.
- Username-only contacts identified by BSUID can be received, but sending to a BSUID is not implemented. A reply requires a phone number; the inbox shows this limitation instead of submitting an unsupported recipient.
- New integration tests use the local fake Graph server. Production acceptance still requires exercising the operations on an eligible Meta account with the appropriate token permissions.
- Message history starts when this app starts seeing traffic; Meta has no endpoint to fetch past conversations.
- Meta download URLs last 5 minutes and uploaded media IDs 7 days; files are fetched on demand, not stored.
- `DELETE /{waba-id}/subscribed_apps` is documented inconsistently by Meta; failures are shown as returned by Meta.
- Costs in analytics appear only when Meta bills the account directly (not on partner credit lines), and lookback is 1 year (templates: 90 days).
