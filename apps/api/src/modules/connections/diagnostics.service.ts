import { Inject, Injectable } from '@nestjs/common';
import type { MetaErrorInfo } from '@wacc/types';
import { iso, isoOrNull } from '../../common/dto';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { type DebugTokenData, MetaAuthService } from '../meta/meta-auth.service';
import { MetaBusinessService } from '../meta/meta-business.service';
import { MetaApiError } from '../meta/meta-error';
import { MetaGraphClient } from '../meta/meta-graph.client';
import { MetaWabaService } from '../meta/meta-waba.service';
import { ConnectionsService } from './connections.service';
import { MetaCredentialsService } from './meta-credentials.service';

type Status = 'ok' | 'warning' | 'error' | 'skipped';
interface Check {
  key: string;
  label: string;
  status: Status;
  detail: string;
  hint: string | null;
  error: MetaErrorInfo | null;
}

const PERMISSION_CHECKS = [
  {
    scope: 'whatsapp_business_management',
    label: 'Management permission',
    required: true,
    hint: 'Needed for WABAs, phone numbers, templates, flows and analytics. Add it to the system user token.',
  },
  {
    scope: 'whatsapp_business_messaging',
    label: 'Messaging permission',
    required: true,
    hint: 'Needed to send messages, upload media and register phone numbers.',
  },
  {
    scope: 'business_management',
    label: 'Business management permission',
    required: false,
    hint: 'Optional. Lets the app discover WABAs owned by or shared with the business portfolio.',
  },
];

/** Readable, step-by-step checks of what a Meta connection can actually do. */
@Injectable()
export class DiagnosticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: MetaCredentialsService,
    private readonly connections: ConnectionsService,
    private readonly metaAuth: MetaAuthService,
    private readonly metaBusiness: MetaBusinessService,
    private readonly metaWaba: MetaWabaService,
    private readonly graph: MetaGraphClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async run(organizationId: string, connectionId: string) {
    const { connection, credentials } = await this.credentials.forConnectionId(organizationId, connectionId);
    const checks: Check[] = [];
    const add = (c: Omit<Check, 'hint' | 'error'> & Partial<Pick<Check, 'hint' | 'error'>>) =>
      checks.push({ hint: null, error: null, ...c });

    let debug: DebugTokenData | null = null;
    let firstError: MetaErrorInfo | null = null;
    try {
      debug = await this.metaAuth.debugToken(credentials.token, credentials.appId, credentials.appSecret);
      add({
        key: 'graph_api',
        label: 'Meta API',
        status: 'ok',
        detail: `Connected (Graph API ${this.env.META_GRAPH_API_VERSION})`,
      });
    } catch (error) {
      const info = error instanceof MetaApiError ? error.info : null;
      firstError = info;
      add({
        key: 'graph_api',
        label: 'Meta API',
        status: 'error',
        detail: info?.message ?? 'Could not reach the Graph API.',
        hint:
          info?.metaCode === 190 || info?.metaCode === 101
            ? 'The app ID or app secret is wrong, so the token cannot be inspected.'
            : (info?.userMessage ?? null),
        error: info,
      });
    }

    if (debug) {
      const expiresAt = debug.expires_at ? new Date(debug.expires_at * 1000) : null;
      const soon = expiresAt && expiresAt.getTime() - Date.now() < 7 * 86_400_000;
      if (!debug.is_valid) {
        add({
          key: 'token',
          label: 'Access token',
          status: 'error',
          detail: debug.error?.message ?? 'Meta reports the token as invalid.',
          hint: 'Generate a new system user token or reconnect with Embedded Signup.',
        });
      } else {
        add({
          key: 'token',
          label: 'Access token',
          status: soon ? 'warning' : 'ok',
          detail: `${debug.type ?? 'Token'}, ${expiresAt ? `expires ${expiresAt.toISOString().slice(0, 10)}` : 'never expires'}`,
          hint: soon ? 'The token expires within 7 days. Rotate it in Organization → Settings.' : null,
        });
      }
      const scopes = debug.scopes ?? [];
      for (const p of PERMISSION_CHECKS) {
        const granted = scopes.includes(p.scope);
        add({
          key: `permission:${p.scope}`,
          label: p.label,
          status: granted ? 'ok' : p.required ? 'error' : 'warning',
          detail: granted ? 'Granted' : `${p.scope} permission missing`,
          hint: granted ? null : p.hint,
        });
      }
    } else {
      for (const p of PERMISSION_CHECKS) {
        add({
          key: `permission:${p.scope}`,
          label: p.label,
          status: 'skipped',
          detail: 'Token could not be inspected.',
        });
      }
    }

    const wabas = await this.prisma.whatsAppBusinessAccount.findMany({ where: { connectionId } });
    if (wabas.length === 0) {
      add({
        key: 'waba',
        label: 'WABA',
        status: 'warning',
        detail: 'No WhatsApp Business Account linked to this connection.',
        hint: 'Run a sync, or reconnect and select a WABA.',
      });
    }
    for (const waba of wabas) {
      const label = waba.name ?? waba.metaWabaId;
      await this.probe(add, `waba:${waba.metaWabaId}`, `WABA ${label}`, async () => {
        await this.metaBusiness.getWaba(waba.metaWabaId, credentials.token);
        return 'Accessible';
      });
      await this.probe(add, `phones:${waba.metaWabaId}`, 'Phone numbers', async () => {
        const page = await this.graph.page(`/${waba.metaWabaId}/phone_numbers`, credentials.token, {
          limit: 100,
          fields: 'id',
        });
        return `${page.items.length}${page.nextCursor ? '+' : ''} accessible`;
      });
      await this.probe(add, `templates:${waba.metaWabaId}`, 'Templates', async () => {
        await this.graph.page(`/${waba.metaWabaId}/message_templates`, credentials.token, {
          limit: 1,
          fields: 'id',
        });
        return 'Accessible';
      });
      await this.probe(add, `subscription:${waba.metaWabaId}`, 'Webhook subscription', async () => {
        const apps = await this.metaWaba.listSubscribedApps(waba.metaWabaId, credentials.token);
        const subscribed = apps.some((a) => a.whatsapp_business_api_data?.id === connection.metaAppId);
        await this.prisma.whatsAppBusinessAccount.update({
          where: { id: waba.id },
          data: { appSubscribed: subscribed },
        });
        if (!subscribed) {
          throw new DiagnosticWarning(
            'App not subscribed to this WABA',
            'Subscribe the app from the WABA page; otherwise Meta will not deliver webhooks for it.',
          );
        }
        return 'Subscribed';
      });
    }

    await this.connections.recordCheck(connectionId, debug, firstError, credentials.token);
    return {
      connectionId,
      checkedAt: iso(new Date()),
      graphApiVersion: this.env.META_GRAPH_API_VERSION,
      token: {
        isValid: debug?.is_valid ?? false,
        type: debug?.type ?? null,
        expiresAt: isoOrNull(debug?.expires_at ? new Date(debug.expires_at * 1000) : null),
        scopes: debug?.scopes ?? [],
      },
      checks,
    };
  }

  private async probe(
    add: (c: Omit<Check, 'hint' | 'error'> & Partial<Pick<Check, 'hint' | 'error'>>) => void,
    key: string,
    label: string,
    fn: () => Promise<string>,
  ) {
    try {
      add({ key, label, status: 'ok', detail: await fn() });
    } catch (error) {
      if (error instanceof DiagnosticWarning) {
        add({ key, label, status: 'warning', detail: error.message, hint: error.hint });
      } else if (error instanceof MetaApiError) {
        add({
          key,
          label,
          status: 'error',
          detail: error.info.message,
          hint: error.info.userMessage,
          error: error.info,
        });
      } else {
        add({ key, label, status: 'error', detail: 'Unexpected error.', hint: null });
      }
    }
  }
}

class DiagnosticWarning extends Error {
  constructor(
    message: string,
    readonly hint: string,
  ) {
    super(message);
  }
}
