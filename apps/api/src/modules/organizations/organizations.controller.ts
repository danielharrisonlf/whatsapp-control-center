import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { SuccessDto, success } from '../../common/dto';
import {
  type AuthUser,
  CurrentMembership,
  CurrentUser,
  type OrgMembership,
  RequireAction,
} from '../auth/auth.decorators';
import {
  AcceptInvitationDto,
  CreatedInvitationDto,
  CreateInvitationDto,
  CreateOrganizationDto,
  InvitationListDto,
  MemberDto,
  MemberListDto,
  OrganizationDto,
  OrganizationListDto,
  UpdateMemberDto,
  UpdateOrganizationDto,
} from './organizations.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  @ApiOperation({ operationId: 'listOrganizations', summary: 'Organizations the current user belongs to' })
  @ZodResponse({ type: OrganizationListDto })
  list(@CurrentUser() user: AuthUser) {
    return this.organizations.listForUser(user.id);
  }

  @Post()
  @ApiOperation({
    operationId: 'createOrganization',
    summary: 'Create an organization (you become its owner)',
  })
  @ZodResponse({ status: 201, type: OrganizationDto })
  create(@CurrentUser() user: AuthUser, @Body() body: CreateOrganizationDto) {
    return this.organizations.create(user.id, body.name);
  }

  @Post('invitations/accept')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'acceptInvitation',
    summary: 'Join an organization using an invitation token',
  })
  @ZodResponse({ status: 200, type: OrganizationDto })
  accept(@CurrentUser() user: AuthUser, @Body() body: AcceptInvitationDto) {
    return this.organizations.acceptInvitation(user.id, body.token);
  }

  @Get(':organizationId')
  @ApiOperation({ operationId: 'getOrganization' })
  @ZodResponse({ type: OrganizationDto })
  get(@CurrentMembership() m: OrgMembership) {
    return this.organizations.get(m.organizationId, m.role);
  }

  @Patch(':organizationId')
  @RequireAction('org.update')
  @ApiOperation({ operationId: 'updateOrganization' })
  @ZodResponse({ type: OrganizationDto })
  update(@CurrentMembership() m: OrgMembership, @Body() body: UpdateOrganizationDto) {
    return this.organizations.update(m.organizationId, m.role, body.name);
  }

  @Delete(':organizationId')
  @RequireAction('org.delete')
  @ApiOperation({
    operationId: 'deleteOrganization',
    summary: 'Delete the organization and all local data (Meta assets are not affected)',
  })
  @ZodResponse({ type: SuccessDto })
  async remove(@CurrentMembership() m: OrgMembership) {
    await this.organizations.delete(m.organizationId);
    return success;
  }

  @Get(':organizationId/members')
  @ApiOperation({ operationId: 'listMembers' })
  @ZodResponse({ type: MemberListDto })
  members(@CurrentMembership() m: OrgMembership) {
    return this.organizations.listMembers(m.organizationId);
  }

  @Patch(':organizationId/members/:memberId')
  @RequireAction('members.manage')
  @ApiOperation({ operationId: 'updateMember' })
  @ZodResponse({ type: MemberDto })
  updateMember(
    @CurrentMembership() m: OrgMembership,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() body: UpdateMemberDto,
  ) {
    return this.organizations.updateMemberRole(m.organizationId, m.role, memberId, body.role);
  }

  @Delete(':organizationId/members/:memberId')
  @RequireAction('members.manage')
  @ApiOperation({ operationId: 'removeMember' })
  @ZodResponse({ type: SuccessDto })
  async removeMember(
    @CurrentMembership() m: OrgMembership,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    await this.organizations.removeMember(m.organizationId, m.role, memberId);
    return success;
  }

  @Get(':organizationId/invitations')
  @RequireAction('members.manage')
  @ApiOperation({ operationId: 'listInvitations', summary: 'Pending invitations' })
  @ZodResponse({ type: InvitationListDto })
  invitations(@CurrentMembership() m: OrgMembership) {
    return this.organizations.listInvitations(m.organizationId);
  }

  @Post(':organizationId/invitations')
  @RequireAction('members.manage')
  @ApiOperation({ operationId: 'createInvitation' })
  @ZodResponse({ status: 201, type: CreatedInvitationDto })
  invite(
    @CurrentMembership() m: OrgMembership,
    @CurrentUser() user: AuthUser,
    @Body() body: CreateInvitationDto,
  ) {
    return this.organizations.invite(m.organizationId, user.id, body.email, body.role);
  }

  @Delete(':organizationId/invitations/:invitationId')
  @RequireAction('members.manage')
  @ApiOperation({ operationId: 'revokeInvitation' })
  @ZodResponse({ type: SuccessDto })
  async revoke(@CurrentMembership() m: OrgMembership, @Param('invitationId', ParseUUIDPipe) id: string) {
    await this.organizations.revokeInvitation(m.organizationId, id);
    return success;
  }
}
