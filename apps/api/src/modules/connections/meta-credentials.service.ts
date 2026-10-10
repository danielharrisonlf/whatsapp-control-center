import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { MetaConnection } from '@prisma/client';
import { AppException, notFound } from '../../common/errors';
import { SecretService } from '../../common/secrets/secret.service';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';

export interface MetaCredentials {
  connectionId: string;
  appId: string;
  appSecret: string;
  token: string;
  scopes: string[];
}

export const secretContext = {
  accessToken: (connectionId: string) => `meta_connection:${connectionId}:access_token`,
  appSecret: (connectionId: string) => `meta_connection:${connectionId}:app_secret`,
  verifyToken: (connectionId: string) => `meta_connection:${connectionId}:verify_token`,
};

/**
 * Resolves decrypted Meta credentials for a local resource, always scoped to an organization.
 * Decrypted values live only in memory for the duration of the call.
 */
@Injectable()
export class MetaCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async forConnection(connection: MetaConnection): Promise<MetaCredentials> {
    if (connection.status === 'DISCONNECTED') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'META_NOT_CONFIGURED',
        'This Meta connection was disconnected.',
      );
    }
    const token = await this.secrets.decrypt(
      connection.accessTokenCiphertext,
      secretContext.accessToken(connection.id),
    );
    const appSecret = connection.appSecretCiphertext
      ? await this.secrets.decrypt(connection.appSecretCiphertext, secretContext.appSecret(connection.id))
      : this.env.META_APP_SECRET;
    return {
      connectionId: connection.id,
      appId: connection.metaAppId,
      appSecret,
      token,
      scopes: connection.scopes,
    };
  }

  async forConnectionId(organizationId: string, connectionId: string) {
    const connection = await this.prisma.metaConnection.findFirst({
      where: { id: connectionId, organizationId },
    });
    if (!connection) throw notFound('Meta connection');
    return { connection, credentials: await this.forConnection(connection) };
  }

  async forWaba(organizationId: string, wabaId: string) {
    const waba = await this.prisma.whatsAppBusinessAccount.findFirst({
      where: { id: wabaId, organizationId },
      include: { connection: true },
    });
    if (!waba) throw notFound('WhatsApp Business Account');
    return { waba, credentials: await this.forConnection(waba.connection) };
  }

  async forPhone(organizationId: string, phoneNumberId: string) {
    const phone = await this.prisma.phoneNumber.findFirst({
      where: { id: phoneNumberId, organizationId },
      include: { waba: { include: { connection: true } } },
    });
    if (!phone) throw notFound('Phone number');
    return { phone, credentials: await this.forConnection(phone.waba.connection) };
  }

  requireScope(credentials: MetaCredentials, scope: string) {
    // Scopes are refreshed by diagnostics; an empty list means we never checked, so let Meta decide.
    if (credentials.scopes.length > 0 && !credentials.scopes.includes(scope)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'META_PERMISSION_MISSING',
        `The Meta token is missing the ${scope} permission. Grant it to the system user (or reconnect with Embedded Signup) and run diagnostics again.`,
      );
    }
  }
}
