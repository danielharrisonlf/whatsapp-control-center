import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { CurrentMembership, type OrgMembership, RequireAction } from '../auth/auth.decorators';
import { SyncReportDto } from '../connections/connections.dto';
import { UpdateWabaDto, WabaDetailDto, WabaListDto } from './wabas.dto';
import { WabasService } from './wabas.service';

@ApiTags('WhatsApp Business Accounts')
@Controller('organizations/:organizationId/wabas')
export class WabasController {
  constructor(private readonly wabas: WabasService) {}

  @Get()
  @ApiOperation({ operationId: 'listWabas' })
  @ZodResponse({ type: WabaListDto })
  list(@CurrentMembership() m: OrgMembership) {
    return this.wabas.list(m.organizationId);
  }

  @Get(':wabaId')
  @ApiOperation({ operationId: 'getWaba' })
  @ZodResponse({ type: WabaDetailDto })
  get(@CurrentMembership() m: OrgMembership, @Param('wabaId', ParseUUIDPipe) id: string) {
    return this.wabas.get(m.organizationId, id);
  }

  @Patch(':wabaId')
  @RequireAction('wabas.sync')
  @ApiOperation({
    operationId: 'updateWaba',
    summary: 'Update local-only fields (label). Never sent to Meta.',
  })
  @ZodResponse({ type: WabaDetailDto })
  update(
    @CurrentMembership() m: OrgMembership,
    @Param('wabaId', ParseUUIDPipe) id: string,
    @Body() body: UpdateWabaDto,
  ) {
    return this.wabas.updateLabel(m.organizationId, id, body.displayLabel);
  }

  @Post(':wabaId/sync')
  @HttpCode(200)
  @RequireAction('wabas.sync')
  @ApiOperation({
    operationId: 'syncWaba',
    summary: 'Sync with Meta (WABA, phone numbers, templates, flows)',
  })
  @ZodResponse({ status: 200, type: SyncReportDto })
  sync(@CurrentMembership() m: OrgMembership, @Param('wabaId', ParseUUIDPipe) id: string) {
    return this.wabas.resync(m.organizationId, id);
  }

  @Post(':wabaId/subscription')
  @HttpCode(200)
  @RequireAction('wabas.subscribe')
  @ApiOperation({ operationId: 'subscribeWaba', summary: 'Subscribe the app to this WABA webhooks' })
  @ZodResponse({ status: 200, type: WabaDetailDto })
  subscribe(@CurrentMembership() m: OrgMembership, @Param('wabaId', ParseUUIDPipe) id: string) {
    return this.wabas.subscribe(m.organizationId, id);
  }

  @Delete(':wabaId/subscription')
  @RequireAction('wabas.subscribe')
  @ApiOperation({ operationId: 'unsubscribeWaba', summary: 'Unsubscribe the app from this WABA webhooks' })
  @ZodResponse({ type: WabaDetailDto })
  unsubscribe(@CurrentMembership() m: OrgMembership, @Param('wabaId', ParseUUIDPipe) id: string) {
    return this.wabas.unsubscribe(m.organizationId, id);
  }
}
