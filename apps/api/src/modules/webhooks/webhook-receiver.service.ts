import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { safeEqual } from '../../common/crypto';
import { SecretService } from '../../common/secrets/secret.service';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { secretContext } from '../connections/meta-credentials.service';
import { summarizePayload, type WebhookPayload } from './webhook-payload';
import { WebhookProcessorService } from './webhook-processor.service';
import { SIGNATURE_HEADER, verifyMetaSignature } from './webhook-signature';

export const PLATFORM_ENDPOINT = 'platform';

/** Headers worth keeping for debugging. Nothing that could carry credentials. */
const KEPT_HEADERS = ['content-type', 'content-length', 'user-agent', SIGNATURE_HEADER, 'x-forwarded-for'];

interface EndpointSecrets {
  endpoint: string;
  verifyToken: string;
  appSecret: string;
  /** Set for per-connection endpoints: only that connection's organization owns events. */
  connection?: { id: string; organizationId: string; webhookId: string };
}

@Injectable()
export class WebhookReceiverService {
  private readonly logger = new Logger(WebhookReceiverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretService,
    private readonly processor: WebhookProcessorService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async resolveEndpoint(endpointKey?: string): Promise<EndpointSecrets | null> {
    if (!endpointKey) {
      if (!this.env.META_APP_SECRET && !this.env.META_WEBHOOK_VERIFY_TOKEN) return null;
      return {
        endpoint: PLATFORM_ENDPOINT,
        verifyToken: this.env.META_WEBHOOK_VERIFY_TOKEN,
        appSecret: this.env.META_APP_SECRET,
      };
    }
    const config = await this.prisma.webhookConfig.findUnique({
      where: { endpointKey },
      include: { connection: true },
    });
    if (!config?.connection.appSecretCiphertext) return null;
    const [verifyToken, appSecret] = await Promise.all([
      this.secrets.decrypt(config.verifyTokenCiphertext, secretContext.verifyToken(config.connectionId)),
      this.secrets.decrypt(
        config.connection.appSecretCiphertext,
        secretContext.appSecret(config.connectionId),
      ),
    ]);
    return {
      endpoint: endpointKey,
      verifyToken,
      appSecret,
      connection: {
        id: config.connectionId,
        organizationId: config.connection.organizationId,
        webhookId: config.id,
      },
    };
  }

  /** GET handshake. Returns the challenge to echo, or null to answer 403. */
  async verifySubscription(
    endpointKey: string | undefined,
    mode?: string,
    token?: string,
    challenge?: string,
  ) {
    const endpoint = await this.resolveEndpoint(endpointKey);
    if (!endpoint?.verifyToken || mode !== 'subscribe' || !token || challenge === undefined) return null;
    if (!safeEqual(token, endpoint.verifyToken)) return null;
    if (endpoint.connection) {
      await this.prisma.webhookConfig.update({
        where: { id: endpoint.connection.webhookId },
        data: { verifiedAt: new Date() },
      });
    }
    return challenge;
  }

  /**
   * Stores the delivery (valid or not) and schedules processing for valid ones.
   * Returns false when the signature is invalid so the controller answers 403.
   */
  async receive(
    endpointKey: string | undefined,
    rawBody: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const endpoint = await this.resolveEndpoint(endpointKey);
    if (!endpoint) return { accepted: false, reason: 'unknown-endpoint' as const };

    const signature = headers[SIGNATURE_HEADER];
    const signatureValid = verifyMetaSignature(
      rawBody,
      typeof signature === 'string' ? signature : undefined,
      endpoint.appSecret,
    );
    let payload: WebhookPayload = {};
    try {
      payload = JSON.parse(rawBody?.toString('utf8') ?? '{}') as WebhookPayload;
    } catch {
      payload = {};
    }
    const summary = summarizePayload(payload);
    const organizationIds = await this.owningOrganizations(endpoint, summary.metaWabaId);
    const keptHeaders = Object.fromEntries(
      KEPT_HEADERS.filter((h) => headers[h] !== undefined).map((h) => [h, headers[h]]),
    );
    const responseStatus = signatureValid ? 200 : 403;

    const ids: string[] = [];
    for (const organizationId of organizationIds.length ? organizationIds : [null]) {
      const event = await this.prisma.webhookEvent.create({
        data: {
          organizationId,
          endpoint: endpoint.endpoint,
          ...summary,
          signatureValid,
          responseStatus,
          processingStatus: signatureValid ? 'PENDING' : 'REJECTED',
          payload: (payload ?? {}) as Prisma.InputJsonValue,
          headers: keptHeaders as Prisma.InputJsonValue,
          error: signatureValid ? null : 'Invalid X-Hub-Signature-256: payload not processed.',
        },
      });
      ids.push(event.id);
    }

    if (!signatureValid) {
      this.logger.warn(
        `Rejected webhook with invalid signature on endpoint ${endpoint.endpoint === PLATFORM_ENDPOINT ? 'platform' : 'connection'}`,
      );
      return { accepted: false, reason: 'invalid-signature' as const };
    }
    // Answer Meta immediately; processing happens right after the response.
    setImmediate(() => {
      for (const id of ids) {
        this.processor
          .process(id)
          .catch((error: unknown) => this.logger.error(`Webhook ${id} processing crashed: ${String(error)}`));
      }
    });
    return { accepted: true, reason: null };
  }

  private async owningOrganizations(endpoint: EndpointSecrets, metaWabaId: string | null) {
    if (endpoint.connection) return [endpoint.connection.organizationId];
    if (!metaWabaId) return [];
    const wabas = await this.prisma.whatsAppBusinessAccount.findMany({
      where: { metaWabaId, connection: { appSecretCiphertext: null } },
      select: { organizationId: true },
    });
    return [...new Set(wabas.map((w) => w.organizationId))];
  }
}
