import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { type MetaConnection, Prisma, type WebhookConfig } from '@prisma/client';
import { capabilitiesFromScopes, type MetaErrorInfo } from '@wacc/types';
import { randomToken } from '../../common/crypto';
import { iso, isoOrNull } from '../../common/dto';
import { AppException, notFound } from '../../common/errors';
import { maskSecret, SecretService } from '../../common/secrets/secret.service';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { type DebugTokenData, MetaAuthService } from '../meta/meta-auth.service';
import { MetaBusinessService } from '../meta/meta-business.service';
import { MetaApiError } from '../meta/meta-error';
import { MetaWabaService } from '../meta/meta-waba.service';
import type { EmbeddedSignupDto, ManualConnectionDto, RotateCredentialsDto } from './connections.dto';
import { secretContext } from './meta-credentials.service';
import { MetaSyncService } from './meta-sync.service';

type ConnectionWithRelations = MetaConnection & { webhook: WebhookConfig | null; _count: { wabas: number } };

function metaFailure(error: unknown, context: string): never {
  if (error instanceof MetaApiError) {
    throw new AppException(
      error.responseStatus,
      'META_ERROR',
      `${context}: ${error.info.userMessage ?? error.info.message}`,
      {
        meta: error.info,
      },
    );
  }
  throw error;
}

/** WABA IDs the token was granted, from `granular_scopes` (how Embedded Signup reports them). */
export function grantedWabaIds(debug: DebugTokenData): string[] {
  const ids = (debug.granular_scopes ?? [])
    .filter((s) => s.scope === 'whatsapp_business_management' || s.scope === 'whatsapp_business_messaging')
    .flatMap((s) => s.target_ids ?? []);
  return [...new Set(ids)];
}

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretService,
    private readonly audit: AuditService,
    private readonly metaAuth: MetaAuthService,
    private readonly metaBusiness: MetaBusinessService,
    private readonly metaWaba: MetaWabaService,
    private readonly sync: MetaSyncService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  platformWebhookUrl() {
    return `${this.env.API_PUBLIC_URL.replace(/\/$/, '')}/webhooks/meta`;
  }

  connectionWebhookUrl(endpointKey: string) {
    return `${this.platformWebhookUrl()}/c/${endpointKey}`;
  }

  config() {
    const missing = [
      !this.env.META_APP_ID && 'META_APP_ID',
      !this.env.META_APP_SECRET && 'META_APP_SECRET',
      !this.env.META_EMBEDDED_SIGNUP_CONFIG_ID && 'META_EMBEDDED_SIGNUP_CONFIG_ID',
    ].filter((v): v is string => Boolean(v));
    return {
      graphApiVersion: this.env.META_GRAPH_API_VERSION,
      embeddedSignup: {
        available: missing.length === 0,
        appId: this.env.META_APP_ID || null,
        configId: this.env.META_EMBEDDED_SIGNUP_CONFIG_ID || null,
        missing,
      },
      platformWebhook: {
        callbackUrl: this.platformWebhookUrl(),
        verifyTokenConfigured: Boolean(this.env.META_WEBHOOK_VERIFY_TOKEN),
        appSecretConfigured: Boolean(this.env.META_APP_SECRET),
      },
    };
  }

  async list(organizationId: string) {
    const connections = await this.prisma.metaConnection.findMany({
      where: { organizationId },
      include: { webhook: true, _count: { select: { wabas: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return connections.map((c) => this.toDto(c));
  }

  async get(organizationId: string, id: string) {
    const connection = await this.prisma.metaConnection.findFirst({
      where: { id, organizationId },
      include: { webhook: true, _count: { select: { wabas: true } } },
    });
    if (!connection) throw notFound('Meta connection');
    return this.toDto(connection);
  }

  async capabilities(organizationId: string) {
    const connections = await this.prisma.metaConnection.findMany({
      where: { organizationId, status: { not: 'DISCONNECTED' } },
      select: { scopes: true },
    });
    const scopes = [...new Set(connections.flatMap((c) => c.scopes))];
    return { connected: connections.length > 0, ...capabilitiesFromScopes(scopes) };
  }

  /**
   * Completes Embedded Signup: exchanges the code with the platform app, inspects the token,
   * subscribes the app to each granted WABA and syncs them.
   */
  async connectEmbeddedSignup(organizationId: string, userId: string, input: EmbeddedSignupDto) {
    const { META_APP_ID: appId, META_APP_SECRET: appSecret } = this.env;
    if (!appId || !appSecret) {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'META_NOT_CONFIGURED',
        'Embedded Signup is not configured on this server. Set META_APP_ID, META_APP_SECRET and META_EMBEDDED_SIGNUP_CONFIG_ID.',
      );
    }
    const exchanged = await this.metaAuth
      .exchangeCode(appId, appSecret, input.code)
      .catch((e) => metaFailure(e, 'Code exchange failed'));
    const debug = await this.metaAuth
      .debugToken(exchanged.access_token, appId, appSecret)
      .catch((e) => metaFailure(e, 'Token inspection failed'));

    const wabaIds = [...new Set([...(input.wabaId ? [input.wabaId] : []), ...grantedWabaIds(debug)])];
    if (wabaIds.length === 0) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'MANUAL_ACTION_REQUIRED',
        'Meta did not share any WhatsApp Business Account with this app. Finish the signup flow and select a WABA.',
      );
    }

    const connection = await this.createConnection({
      organizationId,
      userId,
      name: `Embedded Signup ${new Date().toISOString().slice(0, 10)}`,
      kind: 'EMBEDDED_SIGNUP',
      appId,
      token: exchanged.access_token,
      tokenType: debug.type ?? 'SYSTEM_USER',
      debug,
      appSecret: null,
    });

    // Post-signup step: subscribe our app to each customer WABA so webhooks are delivered.
    for (const wabaId of wabaIds) {
      await this.metaWaba.subscribeApp(wabaId, exchanged.access_token).catch(() => undefined);
    }
    const report = await this.sync.syncConnection(connection, wabaIds);
    await this.audit.record({
      organizationId,
      action: 'WABA_CONNECTED',
      resource: 'meta_connection',
      resourceId: connection.id,
      metadata: {
        kind: 'EMBEDDED_SIGNUP',
        wabaIds,
        phoneNumberId: input.phoneNumberId,
        businessId: input.businessId,
      },
    });
    return { connection: await this.get(organizationId, connection.id), report };
  }

  /** Advanced setup with an app and a system user token the customer already has. */
  async connectManual(organizationId: string, userId: string, input: ManualConnectionDto) {
    await this.metaAuth
      .getApp(input.appId, input.appSecret)
      .catch((e) => metaFailure(e, 'The app ID and app secret do not match'));
    const debug = await this.metaAuth
      .debugToken(input.accessToken, input.appId, input.appSecret)
      .catch((e) => metaFailure(e, 'Token inspection failed'));
    if (!debug.is_valid) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'META_ERROR',
        'Meta reports this access token as invalid or expired.',
      );
    }
    if (debug.app_id && debug.app_id !== input.appId) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'META_ERROR',
        `This token belongs to app ${debug.app_id}, not ${input.appId}.`,
      );
    }
    await this.metaBusiness
      .getWaba(input.wabaId, input.accessToken)
      .catch((e) => metaFailure(e, 'The token cannot access this WABA'));

    const connection = await this.createConnection({
      organizationId,
      userId,
      name: input.name,
      kind: 'MANUAL',
      appId: input.appId,
      token: input.accessToken,
      tokenType: debug.type ?? null,
      debug,
      appSecret: input.appSecret,
    });
    const wabaIds = [...new Set([input.wabaId, ...grantedWabaIds(debug)])];
    const report = await this.sync.syncConnection(connection, wabaIds);
    await this.audit.record({
      organizationId,
      action: 'WABA_CONNECTED',
      resource: 'meta_connection',
      resourceId: connection.id,
      metadata: { kind: 'MANUAL', appId: input.appId, wabaIds },
    });
    return { connection: await this.get(organizationId, connection.id), report };
  }

  async resync(organizationId: string, id: string) {
    const connection = await this.prisma.metaConnection.findFirst({
      where: { id, organizationId },
      include: { wabas: true },
    });
    if (!connection) throw notFound('Meta connection');
    return this.sync.syncConnection(
      connection,
      connection.wabas.map((w) => w.metaWabaId),
    );
  }

  async rotateCredentials(organizationId: string, id: string, input: RotateCredentialsDto) {
    const connection = await this.prisma.metaConnection.findFirst({ where: { id, organizationId } });
    if (!connection) throw notFound('Meta connection');
    const appSecret =
      input.appSecret ??
      (connection.appSecretCiphertext
        ? await this.secrets.decrypt(connection.appSecretCiphertext, secretContext.appSecret(id))
        : this.env.META_APP_SECRET);
    const data: Prisma.MetaConnectionUpdateInput = {};
    if (input.accessToken) {
      const debug = await this.metaAuth
        .debugToken(input.accessToken, connection.metaAppId, appSecret)
        .catch((e) => metaFailure(e, 'Token inspection failed'));
      if (!debug.is_valid)
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'META_ERROR',
          'Meta reports this access token as invalid.',
        );
      Object.assign(data, this.tokenFields(input.accessToken, debug), {
        accessTokenCiphertext: await this.secrets.encrypt(input.accessToken, secretContext.accessToken(id)),
        status: 'ACTIVE',
        lastError: Prisma.DbNull,
      });
    }
    if (input.appSecret) {
      if (connection.kind !== 'MANUAL')
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_FAILED',
          'Embedded Signup connections use the platform app secret.',
        );
      await this.metaAuth
        .getApp(connection.metaAppId, input.appSecret)
        .catch((e) => metaFailure(e, 'The app secret does not match the app'));
      data.appSecretCiphertext = await this.secrets.encrypt(input.appSecret, secretContext.appSecret(id));
    }
    await this.prisma.metaConnection.update({ where: { id }, data });
    await this.audit.record({
      organizationId,
      action: 'META_SECRET_UPDATED',
      resource: 'meta_connection',
      resourceId: id,
      metadata: { accessToken: Boolean(input.accessToken), appSecret: Boolean(input.appSecret) },
    });
    return this.get(organizationId, id);
  }

  /** Removes the connection and its local cache. Nothing is deleted at Meta. */
  async remove(organizationId: string, id: string) {
    const connection = await this.prisma.metaConnection.findFirst({
      where: { id, organizationId },
      include: { wabas: true },
    });
    if (!connection) throw notFound('Meta connection');
    await this.prisma.metaConnection.delete({ where: { id } });
    await this.audit.record({
      organizationId,
      action: 'META_CONNECTION_REMOVED',
      resource: 'meta_connection',
      resourceId: id,
      metadata: { name: connection.name, wabaIds: connection.wabas.map((w) => w.metaWabaId) },
    });
  }

  async recordCheck(id: string, debug: DebugTokenData | null, error: MetaErrorInfo | null, token?: string) {
    await this.prisma.metaConnection.update({
      where: { id },
      data: {
        ...(debug && token ? this.tokenFields(token, debug) : {}),
        lastCheckedAt: new Date(),
        status: error || (debug && !debug.is_valid) ? 'ERROR' : 'ACTIVE',
        lastError: error ? (error as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    });
  }

  /** The verify token is generated by us and must be pasted into the Meta App dashboard. */
  async revealVerifyToken(organizationId: string, id: string) {
    const connection = await this.prisma.metaConnection.findFirst({
      where: { id, organizationId },
      include: { webhook: true },
    });
    if (!connection?.webhook) throw notFound('Webhook endpoint');
    const verifyToken = await this.secrets.decrypt(
      connection.webhook.verifyTokenCiphertext,
      secretContext.verifyToken(id),
    );
    await this.audit.record({
      organizationId,
      action: 'WEBHOOK_CHANGED',
      resource: 'webhook_config',
      resourceId: connection.webhook.id,
      metadata: { revealedVerifyToken: true },
    });
    return { callbackUrl: this.connectionWebhookUrl(connection.webhook.endpointKey), verifyToken };
  }

  private tokenFields(token: string, debug: DebugTokenData) {
    return {
      accessTokenPreview: maskSecret(token),
      tokenType: debug.type ?? null,
      tokenExpiresAt: debug.expires_at ? new Date(debug.expires_at * 1000) : null,
      scopes: debug.scopes ?? [],
      granularScopes: (debug.granular_scopes ?? []) as Prisma.InputJsonValue,
      lastCheckedAt: new Date(),
    };
  }

  private async createConnection(input: {
    organizationId: string;
    userId: string;
    name: string;
    kind: 'EMBEDDED_SIGNUP' | 'MANUAL';
    appId: string;
    token: string;
    tokenType: string | null;
    debug: DebugTokenData;
    appSecret: string | null;
  }) {
    // The id is chosen up front because it is bound into the ciphertext as AAD.
    const id = randomUUID();
    const verifyToken = randomToken(24);
    const connection = await this.prisma.metaConnection.create({
      data: {
        id,
        organizationId: input.organizationId,
        name: input.name,
        kind: input.kind,
        metaAppId: input.appId,
        accessTokenCiphertext: await this.secrets.encrypt(input.token, secretContext.accessToken(id)),
        appSecretCiphertext: input.appSecret
          ? await this.secrets.encrypt(input.appSecret, secretContext.appSecret(id))
          : null,
        createdById: input.userId,
        ...this.tokenFields(input.token, input.debug),
        tokenType: input.tokenType,
        // A connection with its own app receives webhooks on its own endpoint.
        ...(input.appSecret
          ? {
              webhook: {
                create: {
                  endpointKey: randomToken(18),
                  verifyTokenCiphertext: await this.secrets.encrypt(
                    verifyToken,
                    secretContext.verifyToken(id),
                  ),
                  verifyTokenPreview: maskSecret(verifyToken),
                },
              },
            }
          : {}),
      },
    });
    await this.audit.record({
      organizationId: input.organizationId,
      action: 'META_CONNECTION_CREATED',
      resource: 'meta_connection',
      resourceId: id,
      metadata: {
        kind: input.kind,
        appId: input.appId,
        tokenPreview: maskSecret(input.token),
        scopes: input.debug.scopes,
      },
    });
    return connection;
  }

  toDto(c: ConnectionWithRelations) {
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      status: c.status,
      metaAppId: c.metaAppId,
      usesPlatformApp: !c.appSecretCiphertext,
      accessTokenPreview: c.accessTokenPreview,
      tokenType: c.tokenType,
      tokenExpiresAt: isoOrNull(c.tokenExpiresAt),
      scopes: c.scopes,
      capabilities: { connected: c.status !== 'DISCONNECTED', ...capabilitiesFromScopes(c.scopes) },
      lastCheckedAt: isoOrNull(c.lastCheckedAt),
      lastSyncedAt: isoOrNull(c.lastSyncedAt),
      lastError: (c.lastError as MetaErrorInfo | null) ?? null,
      wabaCount: c._count.wabas,
      webhook: c.webhook
        ? {
            callbackUrl: this.connectionWebhookUrl(c.webhook.endpointKey),
            verifyTokenPreview: c.webhook.verifyTokenPreview,
            verifiedAt: isoOrNull(c.webhook.verifiedAt),
          }
        : null,
      createdAt: iso(c.createdAt),
    };
  }
}
