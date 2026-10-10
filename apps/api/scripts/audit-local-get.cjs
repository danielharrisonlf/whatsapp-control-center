// Read-only evidence collector. Never emits credentials or changes business assets.
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { PrismaClient } = require('@prisma/client');
const { loadEnv } = require('../dist/config/env.js');
const { AesGcmSecretService } = require('../dist/common/secrets/secret.service.js');

async function main() {
  const root = path.resolve(__dirname, '../../..');
  const env = loadEnv({ ...process.env, ...parseEnv(fs.readFileSync(path.join(root, '.env'), 'utf8')) });
  const fixtureSource = fs.readFileSync(path.join(root, 'apps/www/e2e/critical-flows.spec.ts'), 'utf8');
  const knownFixtureToken = fixtureSource.match(/token: '([^']+)'/)?.[1];
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  const report = {
    collectedAt: new Date().toISOString(),
    environment: 'local development; no application login session',
    baseUrl: `http://localhost:${env.API_PORT}`,
    inventorySource: 'read-only database inspection, separate from GET evidence',
    credentialInventory: {},
    requests: [],
  };
  let orgId;
  let connectionId;
  let phoneId;
  try {
    const connections = await db.metaConnection.findMany();
    const phones = await db.phoneNumber.findMany();
    const secrets = new AesGcmSecretService(env);
    report.credentialInventory = {
      users: await db.user.count(),
      organizations: await db.organization.count(),
      phoneCount: phones.length,
      connections: [],
    };
    for (const connection of connections) {
      const token = await secrets.decrypt(
        connection.accessTokenCiphertext,
        `meta_connection:${connection.id}:access_token`,
      );
      const fixtureToken = /FAKETOKEN|FORTESTS/i.test(token);
      report.credentialInventory.connections.push({
        status: connection.status,
        type: connection.kind,
        tokenStored: Boolean(token),
        appIdStored: Boolean(connection.metaAppId),
        appSecretStored: Boolean(connection.appSecretCiphertext),
        knownTestTokenPattern: fixtureToken,
        matchesTestFixtureToken: Boolean(knownFixtureToken && token === knownFixtureToken),
        realMetaValidity: 'not verified',
      });
    }
    orgId = connections[0]?.organizationId;
    connectionId = connections[0]?.id;
    phoneId = phones[0]?.id;
  } finally {
    await db.$disconnect();
  }
  const openapi = JSON.parse(fs.readFileSync(path.join(root, 'apps/api/openapi.json'), 'utf8'));
  const sentinel = '00000000-0000-4000-8000-000000000001';
  const values = {
    organizationId: orgId || sentinel,
    connectionId: connectionId || sentinel,
    phoneId: phoneId || sentinel,
    code: 'AUDIT_SENTINEL',
    endpointKey: 'audit-sentinel',
  };
  for (const [template, methods] of Object.entries(openapi.paths)) {
    if (!methods.get) continue;
    const urlPath = template.replace(/\{([^}]+)\}/g, (_, name) =>
      encodeURIComponent(values[name] || sentinel),
    );
    const started = performance.now();
    try {
      const response = await fetch(report.baseUrl + urlPath, {
        signal: AbortSignal.timeout(25000),
        redirect: 'manual',
      });
      const contentType = response.headers.get('content-type');
      const body = contentType?.includes('json')
        ? await response.json()
        : (await response.text()).slice(0, 300);
      report.requests.push({
        operationId: methods.get.operationId,
        template,
        urlPath,
        status: response.status,
        durationMs: Math.round(performance.now() - started),
        contentType,
        body,
      });
    } catch (error) {
      report.requests.push({
        operationId: methods.get.operationId,
        template,
        urlPath,
        status: null,
        durationMs: Math.round(performance.now() - started),
        error: error.name,
      });
    }
  }
  report.parameterNote =
    'Existing organization, connection and phone IDs when available; all other IDs are synthetic sentinels. No session cookies were sent. HTTP 401 proves only the authentication boundary.';
  fs.mkdirSync(path.join(root, 'output/pdf'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'output/pdf/get-endpoints-local-evidence.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    JSON.stringify({
      baseUrl: report.baseUrl,
      credentialInventory: report.credentialInventory,
      counts: report.requests.reduce((acc, row) => {
        acc[row.status ?? 'error'] = (acc[row.status ?? 'error'] || 0) + 1;
        return acc;
      }, {}),
    }),
  );
}
main().catch((error) => {
  console.error(error.name);
  process.exitCode = 1;
});
