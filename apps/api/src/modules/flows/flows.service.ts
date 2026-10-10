import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { iso, isoOrNull } from '../../common/dto';
import { badRequest, notFound } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MetaCredentialsService } from '../connections/meta-credentials.service';
import { MetaSyncService } from '../connections/meta-sync.service';
import { MetaFlowService } from '../meta/meta-flow.service';

const include = { waba: { select: { id: true, metaWabaId: true, name: true } } } as const;
type FlowRow = Prisma.WhatsAppFlowGetPayload<{ include: typeof include }>;
const json = (v: unknown) => v as Prisma.InputJsonValue;

function parseFlowJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw badRequest(`Flow JSON is not valid JSON: ${(error as Error).message}`);
  }
}

@Injectable()
export class FlowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: MetaCredentialsService,
    private readonly sync: MetaSyncService,
    private readonly metaFlows: MetaFlowService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, wabaId?: string) {
    const rows = await this.prisma.whatsAppFlow.findMany({
      where: { organizationId, ...(wabaId ? { wabaId } : {}) },
      include,
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
    return rows.map((r) => this.toDto(r));
  }

  async get(organizationId: string, id: string) {
    return this.toDto(await this.find(organizationId, id));
  }

  async syncAll(organizationId: string, wabaId?: string) {
    const wabas = await this.prisma.whatsAppBusinessAccount.findMany({
      where: { organizationId, ...(wabaId ? { id: wabaId } : {}) },
      include: { connection: true },
    });
    let synced = 0;
    for (const waba of wabas) {
      synced += await this.sync.syncFlows(waba, await this.credentials.forConnection(waba.connection));
    }
    return { synced };
  }

  /** Pulls metadata, validation errors and the current flow JSON from Meta. */
  async refresh(organizationId: string, id: string) {
    const row = await this.find(organizationId, id);
    const { credentials } = await this.credentials.forWaba(organizationId, row.wabaId);
    const [node, flowJson] = await Promise.all([
      this.metaFlows.get(row.metaFlowId, credentials.token),
      this.metaFlows.downloadJson(row.metaFlowId, credentials.token).catch(() => null),
    ]);
    const updated = await this.prisma.whatsAppFlow.update({
      where: { id },
      data: {
        name: node.name,
        status: node.status,
        categories: node.categories ?? [],
        validationErrors: json(node.validation_errors ?? []),
        jsonVersion: node.json_version ?? null,
        dataApiVersion: node.data_api_version ?? null,
        endpointUri: node.endpoint_uri ?? null,
        ...(flowJson ? { flowJson: json(flowJson) } : {}),
        lastSyncedAt: new Date(),
      },
      include,
    });
    return this.toDto(updated);
  }

  async create(
    organizationId: string,
    input: {
      wabaId: string;
      name: string;
      categories: string[];
      flowJson?: string;
      endpointUri?: string;
      cloneFlowId?: string;
    },
  ) {
    if (input.flowJson) parseFlowJson(input.flowJson);
    const { waba, credentials } = await this.credentials.forWaba(organizationId, input.wabaId);
    const created = await this.metaFlows.create(waba.metaWabaId, credentials.token, input);
    const row = await this.prisma.whatsAppFlow.create({
      data: {
        organizationId,
        wabaId: waba.id,
        metaFlowId: created.id,
        name: input.name,
        status: 'DRAFT',
        categories: input.categories,
        endpointUri: input.endpointUri ?? null,
        flowJson: input.flowJson ? json(parseFlowJson(input.flowJson)) : undefined,
        validationErrors: json(created.validation_errors ?? []),
      },
    });
    await this.audit.record({
      organizationId,
      action: 'FLOW_CREATED',
      resource: 'flow',
      resourceId: row.id,
      metadata: { name: input.name, metaFlowId: created.id },
    });
    return this.refresh(organizationId, row.id);
  }

  async updateMetadata(
    organizationId: string,
    id: string,
    input: { name?: string; categories?: string[]; endpointUri?: string },
  ) {
    const row = await this.find(organizationId, id);
    const { credentials } = await this.credentials.forWaba(organizationId, row.wabaId);
    await this.metaFlows.updateMetadata(row.metaFlowId, credentials.token, input);
    await this.audit.record({
      organizationId,
      action: 'FLOW_UPDATED',
      resource: 'flow',
      resourceId: id,
      metadata: { fields: Object.keys(input) },
    });
    return this.refresh(organizationId, id);
  }

  /** Uploads flow.json. Meta returns validation errors; the flow stays in DRAFT until published. */
  async updateJson(organizationId: string, id: string, flowJson: string) {
    const parsed = parseFlowJson(flowJson);
    const row = await this.find(organizationId, id);
    if (row.status !== 'DRAFT')
      throw badRequest('Only draft flows can be changed. Clone the flow to edit a published one.');
    const { credentials } = await this.credentials.forWaba(organizationId, row.wabaId);
    const result = await this.metaFlows.uploadJson(row.metaFlowId, credentials.token, flowJson);
    await this.prisma.whatsAppFlow.update({
      where: { id },
      data: { flowJson: json(parsed), validationErrors: json(result.validation_errors ?? []) },
    });
    await this.audit.record({
      organizationId,
      action: 'FLOW_UPDATED',
      resource: 'flow',
      resourceId: id,
      metadata: { fields: ['flow_json'] },
    });
    return this.refresh(organizationId, id);
  }

  async publish(organizationId: string, id: string) {
    const row = await this.find(organizationId, id);
    const { credentials } = await this.credentials.forWaba(organizationId, row.wabaId);
    await this.metaFlows.publish(row.metaFlowId, credentials.token);
    await this.audit.record({
      organizationId,
      action: 'FLOW_PUBLISHED',
      resource: 'flow',
      resourceId: id,
      metadata: { name: row.name },
    });
    return this.refresh(organizationId, id);
  }

  async deprecate(organizationId: string, id: string) {
    const row = await this.find(organizationId, id);
    const { credentials } = await this.credentials.forWaba(organizationId, row.wabaId);
    await this.metaFlows.deprecate(row.metaFlowId, credentials.token);
    await this.audit.record({
      organizationId,
      action: 'FLOW_DEPRECATED',
      resource: 'flow',
      resourceId: id,
      metadata: { name: row.name },
    });
    return this.refresh(organizationId, id);
  }

  async delete(organizationId: string, id: string) {
    const row = await this.find(organizationId, id);
    if (row.status !== 'DRAFT')
      throw badRequest('Only draft flows can be deleted. Deprecate published flows instead.');
    const { credentials } = await this.credentials.forWaba(organizationId, row.wabaId);
    await this.metaFlows.delete(row.metaFlowId, credentials.token);
    await this.prisma.whatsAppFlow.delete({ where: { id } });
    await this.audit.record({
      organizationId,
      action: 'FLOW_DELETED',
      resource: 'flow',
      resourceId: id,
      metadata: { name: row.name },
    });
  }

  async preview(organizationId: string, id: string, invalidate: boolean) {
    const row = await this.find(organizationId, id);
    const { credentials } = await this.credentials.forWaba(organizationId, row.wabaId);
    const node = await this.metaFlows.preview(row.metaFlowId, credentials.token, invalidate);
    if (!node.preview) throw notFound('Flow preview');
    await this.prisma.whatsAppFlow.update({
      where: { id },
      data: { previewUrl: node.preview.preview_url, previewExpiresAt: new Date(node.preview.expires_at) },
    });
    return { previewUrl: node.preview.preview_url, expiresAt: iso(new Date(node.preview.expires_at)) };
  }

  private async find(organizationId: string, id: string) {
    const row = await this.prisma.whatsAppFlow.findFirst({ where: { id, organizationId }, include });
    if (!row) throw notFound('Flow');
    return row;
  }

  toDto(r: FlowRow) {
    return {
      id: r.id,
      metaFlowId: r.metaFlowId,
      waba: r.waba,
      name: r.name,
      status: r.status,
      categories: r.categories,
      jsonVersion: r.jsonVersion,
      dataApiVersion: r.dataApiVersion,
      endpointUri: r.endpointUri,
      validationErrors: Array.isArray(r.validationErrors)
        ? (r.validationErrors as Record<string, unknown>[])
        : [],
      flowJson: r.flowJson ?? null,
      lastSyncedAt: isoOrNull(r.lastSyncedAt),
      updatedAt: iso(r.updatedAt),
      createdAt: iso(r.createdAt),
    };
  }
}
