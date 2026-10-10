import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { SuccessDto, success } from '../../common/dto';
import {
  type AuthUser,
  CurrentMembership,
  CurrentUser,
  type OrgMembership,
  RequireAction,
} from '../auth/auth.decorators';
import {
  CapabilitiesDto,
  ConnectionDto,
  ConnectionListDto,
  ConnectResultDto,
  DiagnosticsDto,
  EmbeddedSignupDto,
  ManualConnectionDto,
  MetaConfigDto,
  RotateCredentialsDto,
  SyncReportDto,
} from './connections.dto';
import { ConnectionsService } from './connections.service';
import { DiagnosticsService } from './diagnostics.service';

class RevealedVerifyTokenDto extends createZodDto(
  z.object({ callbackUrl: z.string(), verifyToken: z.string() }).meta({ id: 'RevealedVerifyToken' }),
) {}

@ApiTags('Meta connections')
@Controller('organizations/:organizationId')
export class ConnectionsController {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly diagnostics: DiagnosticsService,
  ) {}

  @Get('meta/config')
  @ApiOperation({
    operationId: 'getMetaConfig',
    summary: 'Graph API version, Embedded Signup and platform webhook settings',
  })
  @ZodResponse({ type: MetaConfigDto })
  config() {
    return this.connections.config();
  }

  @Get('capabilities')
  @ApiOperation({
    operationId: 'getCapabilities',
    summary: 'What the connected Meta integrations allow, from their token scopes',
  })
  @ZodResponse({ type: CapabilitiesDto })
  capabilities(@CurrentMembership() m: OrgMembership) {
    return this.connections.capabilities(m.organizationId);
  }

  @Get('connections')
  @ApiOperation({ operationId: 'listConnections' })
  @ZodResponse({ type: ConnectionListDto })
  list(@CurrentMembership() m: OrgMembership) {
    return this.connections.list(m.organizationId);
  }

  @Get('connections/:connectionId')
  @ApiOperation({ operationId: 'getConnection' })
  @ZodResponse({ type: ConnectionDto })
  get(@CurrentMembership() m: OrgMembership, @Param('connectionId', ParseUUIDPipe) id: string) {
    return this.connections.get(m.organizationId, id);
  }

  @Post('connections/embedded-signup')
  @RequireAction('connections.manage')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    operationId: 'connectEmbeddedSignup',
    summary: 'Finish Meta Embedded Signup with the code returned by FB.login',
  })
  @ZodResponse({ status: 201, type: ConnectResultDto })
  embedded(
    @CurrentMembership() m: OrgMembership,
    @CurrentUser() user: AuthUser,
    @Body() body: EmbeddedSignupDto,
  ) {
    return this.connections.connectEmbeddedSignup(m.organizationId, user.id, body);
  }

  @Post('connections/manual')
  @RequireAction('connections.manage')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    operationId: 'connectManual',
    summary: 'Advanced: connect with an app ID, app secret and system user token',
  })
  @ZodResponse({ status: 201, type: ConnectResultDto })
  manual(
    @CurrentMembership() m: OrgMembership,
    @CurrentUser() user: AuthUser,
    @Body() body: ManualConnectionDto,
  ) {
    return this.connections.connectManual(m.organizationId, user.id, body);
  }

  @Post('connections/:connectionId/sync')
  @HttpCode(200)
  @RequireAction('wabas.sync')
  @ApiOperation({
    operationId: 'syncConnection',
    summary: 'Sync WABAs, phone numbers, templates and flows from Meta',
  })
  @ZodResponse({ status: 200, type: SyncReportDto })
  sync(@CurrentMembership() m: OrgMembership, @Param('connectionId', ParseUUIDPipe) id: string) {
    return this.connections.resync(m.organizationId, id);
  }

  @Post('connections/:connectionId/diagnostics')
  @HttpCode(200)
  @RequireAction('logs.read')
  @ApiOperation({
    operationId: 'runDiagnostics',
    summary: 'Test the Meta connection: token, permissions, assets and webhook subscription',
  })
  @ZodResponse({ status: 200, type: DiagnosticsDto })
  runDiagnostics(@CurrentMembership() m: OrgMembership, @Param('connectionId', ParseUUIDPipe) id: string) {
    return this.diagnostics.run(m.organizationId, id);
  }

  @Patch('connections/:connectionId/credentials')
  @RequireAction('connections.manage')
  @ApiOperation({ operationId: 'rotateCredentials', summary: 'Replace the access token or app secret' })
  @ZodResponse({ type: ConnectionDto })
  rotate(
    @CurrentMembership() m: OrgMembership,
    @Param('connectionId', ParseUUIDPipe) id: string,
    @Body() body: RotateCredentialsDto,
  ) {
    return this.connections.rotateCredentials(m.organizationId, id, body);
  }

  @Post('connections/:connectionId/webhook/reveal-verify-token')
  @HttpCode(200)
  @RequireAction('webhooks.manage')
  @ApiOperation({
    operationId: 'revealVerifyToken',
    summary: 'Show the verify token to paste in the Meta App dashboard (audited)',
  })
  @ZodResponse({ status: 200, type: RevealedVerifyTokenDto })
  reveal(@CurrentMembership() m: OrgMembership, @Param('connectionId', ParseUUIDPipe) id: string) {
    return this.connections.revealVerifyToken(m.organizationId, id);
  }

  @Delete('connections/:connectionId')
  @RequireAction('connections.manage')
  @ApiOperation({
    operationId: 'deleteConnection',
    summary: 'Disconnect: removes local data only; nothing is changed at Meta',
  })
  @ZodResponse({ type: SuccessDto })
  async remove(@CurrentMembership() m: OrgMembership, @Param('connectionId', ParseUUIDPipe) id: string) {
    await this.connections.remove(m.organizationId, id);
    return success;
  }
}
