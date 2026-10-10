import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FLOW_CATEGORIES } from '@wacc/types';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { SuccessDto, success, zDate, zDateNullable } from '../../common/dto';
import { CurrentMembership, type OrgMembership, RequireAction } from '../auth/auth.decorators';
import { FlowsService } from './flows.service';

const FlowSchema = z
  .object({
    id: z.string(),
    metaFlowId: z.string(),
    waba: z.object({ id: z.string(), metaWabaId: z.string(), name: z.string().nullable() }),
    name: z.string(),
    status: z.string(),
    categories: z.array(z.string()),
    jsonVersion: z.string().nullable(),
    dataApiVersion: z.string().nullable(),
    endpointUri: z.string().nullable(),
    validationErrors: z.array(z.record(z.string(), z.unknown())),
    flowJson: z.unknown().nullable(),
    lastSyncedAt: zDateNullable,
    updatedAt: zDate,
    createdAt: zDate,
  })
  .meta({ id: 'Flow' });
class FlowDto extends createZodDto(FlowSchema) {}
class FlowListDto extends createZodDto(z.array(FlowSchema).meta({ id: 'FlowList' })) {}
class FlowQueryDto extends createZodDto(z.object({ wabaId: z.uuid().optional() })) {}
class SyncFlowsDto extends createZodDto(
  z.object({ wabaId: z.uuid().optional() }).meta({ id: 'SyncFlowsInput' }),
) {}
const categories = z.array(z.enum(FLOW_CATEGORIES)).min(1);
class CreateFlowDto extends createZodDto(
  z
    .object({
      wabaId: z.uuid(),
      name: z.string().trim().min(1).max(200),
      categories,
      flowJson: z
        .string()
        .max(10 * 1024 * 1024)
        .optional(),
      endpointUri: z.url().optional(),
      cloneFlowId: z.string().regex(/^\d+$/).optional(),
    })
    .meta({ id: 'CreateFlowInput' }),
) {}
class UpdateFlowDto extends createZodDto(
  z
    .object({
      name: z.string().trim().min(1).max(200).optional(),
      categories: categories.optional(),
      endpointUri: z.url().optional(),
    })
    .meta({ id: 'UpdateFlowInput' }),
) {}
class UpdateFlowJsonDto extends createZodDto(
  z
    .object({
      flowJson: z
        .string()
        .min(2)
        .max(10 * 1024 * 1024),
    })
    .meta({ id: 'UpdateFlowJsonInput' }),
) {}
class FlowPreviewDto extends createZodDto(
  z.object({ previewUrl: z.string(), expiresAt: zDate }).meta({ id: 'FlowPreview' }),
) {}
class FlowPreviewQueryDto extends createZodDto(
  z.object({
    invalidate: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
  }),
) {}
class FlowSyncResultDto extends createZodDto(
  z.object({ synced: z.number() }).meta({ id: 'FlowSyncResult' }),
) {}

@ApiTags('Flows')
@Controller('organizations/:organizationId/flows')
export class FlowsController {
  constructor(private readonly flows: FlowsService) {}

  @Get()
  @ApiOperation({ operationId: 'listFlows' })
  @ZodResponse({ type: FlowListDto })
  list(@CurrentMembership() m: OrgMembership, @Query() q: FlowQueryDto) {
    return this.flows.list(m.organizationId, q.wabaId);
  }

  @Post()
  @RequireAction('flows.manage')
  @ApiOperation({
    operationId: 'createFlow',
    summary: 'Create a draft flow (optionally with flow JSON or by cloning)',
  })
  @ZodResponse({ status: 201, type: FlowDto })
  create(@CurrentMembership() m: OrgMembership, @Body() body: CreateFlowDto) {
    return this.flows.create(m.organizationId, body);
  }

  @Post('sync')
  @HttpCode(200)
  @RequireAction('wabas.sync')
  @ApiOperation({ operationId: 'syncFlows' })
  @ZodResponse({ status: 200, type: FlowSyncResultDto })
  sync(@CurrentMembership() m: OrgMembership, @Body() body: SyncFlowsDto) {
    return this.flows.syncAll(m.organizationId, body.wabaId);
  }

  @Get(':flowId')
  @ApiOperation({ operationId: 'getFlow' })
  @ZodResponse({ type: FlowDto })
  get(@CurrentMembership() m: OrgMembership, @Param('flowId', ParseUUIDPipe) id: string) {
    return this.flows.get(m.organizationId, id);
  }

  @Post(':flowId/refresh')
  @HttpCode(200)
  @RequireAction('wabas.sync')
  @ApiOperation({
    operationId: 'refreshFlow',
    summary: 'Pull status, validation errors and flow JSON from Meta',
  })
  @ZodResponse({ status: 200, type: FlowDto })
  refresh(@CurrentMembership() m: OrgMembership, @Param('flowId', ParseUUIDPipe) id: string) {
    return this.flows.refresh(m.organizationId, id);
  }

  @Patch(':flowId')
  @RequireAction('flows.manage')
  @ApiOperation({ operationId: 'updateFlow' })
  @ZodResponse({ type: FlowDto })
  update(
    @CurrentMembership() m: OrgMembership,
    @Param('flowId', ParseUUIDPipe) id: string,
    @Body() body: UpdateFlowDto,
  ) {
    return this.flows.updateMetadata(m.organizationId, id, body);
  }

  @Put(':flowId/json')
  @RequireAction('flows.manage')
  @ApiOperation({
    operationId: 'updateFlowJson',
    summary: 'Upload flow.json (drafts only). Returns Meta validation errors.',
  })
  @ZodResponse({ type: FlowDto })
  updateJson(
    @CurrentMembership() m: OrgMembership,
    @Param('flowId', ParseUUIDPipe) id: string,
    @Body() body: UpdateFlowJsonDto,
  ) {
    return this.flows.updateJson(m.organizationId, id, body.flowJson);
  }

  @Post(':flowId/publish')
  @HttpCode(200)
  @RequireAction('flows.manage')
  @ApiOperation({
    operationId: 'publishFlow',
    summary: 'Publish (irreversible: published flows cannot be edited)',
  })
  @ZodResponse({ status: 200, type: FlowDto })
  publish(@CurrentMembership() m: OrgMembership, @Param('flowId', ParseUUIDPipe) id: string) {
    return this.flows.publish(m.organizationId, id);
  }

  @Post(':flowId/deprecate')
  @HttpCode(200)
  @RequireAction('flows.manage')
  @ApiOperation({ operationId: 'deprecateFlow' })
  @ZodResponse({ status: 200, type: FlowDto })
  deprecate(@CurrentMembership() m: OrgMembership, @Param('flowId', ParseUUIDPipe) id: string) {
    return this.flows.deprecate(m.organizationId, id);
  }

  @Get(':flowId/preview')
  @ApiOperation({ operationId: 'getFlowPreview', summary: 'Web preview link (valid 30 days)' })
  @ZodResponse({ type: FlowPreviewDto })
  preview(
    @CurrentMembership() m: OrgMembership,
    @Param('flowId', ParseUUIDPipe) id: string,
    @Query() q: FlowPreviewQueryDto,
  ) {
    return this.flows.preview(m.organizationId, id, q.invalidate);
  }

  @Delete(':flowId')
  @RequireAction('flows.manage')
  @ApiOperation({ operationId: 'deleteFlow', summary: 'Delete a draft flow' })
  @ZodResponse({ type: SuccessDto })
  async remove(@CurrentMembership() m: OrgMembership, @Param('flowId', ParseUUIDPipe) id: string) {
    await this.flows.delete(m.organizationId, id);
    return success;
  }
}
