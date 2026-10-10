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
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ZodResponse } from 'nestjs-zod';
import { CurrentMembership, type OrgMembership, RequireAction } from '../auth/auth.decorators';
import {
  BlockedUsersPageDto,
  BlockedUsersQueryDto,
  ChangeBlockedUsersDto,
  ChangeBlockedUsersResultDto,
  PhoneCommerceSettingsDto,
  PhoneEncryptionDto,
  SetPhoneEncryptionDto,
  UpdatePhoneCommerceSettingsDto,
} from './phone-settings.dto';
import { PhoneSettingsService } from './phone-settings.service';

@ApiTags('Phone numbers')
@Controller('organizations/:organizationId/phone-numbers/:phoneId')
export class PhoneSettingsController {
  constructor(private readonly settings: PhoneSettingsService) {}

  @Get('commerce-settings')
  @ApiOperation({ operationId: 'getPhoneCommerceSettings' })
  @ZodResponse({ type: PhoneCommerceSettingsDto })
  commerce(@CurrentMembership() m: OrgMembership, @Param('phoneId', ParseUUIDPipe) id: string) {
    return this.settings.commerce(m.organizationId, id);
  }

  @Patch('commerce-settings')
  @RequireAction('phones.manage')
  @ApiOperation({ operationId: 'updatePhoneCommerceSettings' })
  @ZodResponse({ type: PhoneCommerceSettingsDto })
  updateCommerce(
    @CurrentMembership() m: OrgMembership,
    @Param('phoneId', ParseUUIDPipe) id: string,
    @Body() body: UpdatePhoneCommerceSettingsDto,
  ) {
    return this.settings.updateCommerce(m.organizationId, id, body);
  }

  @Get('encryption')
  @ApiOperation({ operationId: 'getPhoneEncryption' })
  @ZodResponse({ type: PhoneEncryptionDto })
  encryption(@CurrentMembership() m: OrgMembership, @Param('phoneId', ParseUUIDPipe) id: string) {
    return this.settings.encryption(m.organizationId, id);
  }

  @Post('encryption')
  @HttpCode(200)
  @RequireAction('phones.manage')
  @ApiOperation({
    operationId: 'setPhoneEncryption',
    summary: 'Upload the public RSA key for Flow data exchange',
  })
  @ZodResponse({ status: 200, type: PhoneEncryptionDto })
  setEncryption(
    @CurrentMembership() m: OrgMembership,
    @Param('phoneId', ParseUUIDPipe) id: string,
    @Body() body: SetPhoneEncryptionDto,
  ) {
    return this.settings.setEncryption(m.organizationId, id, body.businessPublicKey);
  }

  @Get('blocked-users')
  @ApiOperation({ operationId: 'listBlockedUsers' })
  @ZodResponse({ type: BlockedUsersPageDto })
  blockedUsers(
    @CurrentMembership() m: OrgMembership,
    @Param('phoneId', ParseUUIDPipe) id: string,
    @Query() query: BlockedUsersQueryDto,
  ) {
    return this.settings.blockedUsers(m.organizationId, id, query);
  }

  @Post('blocked-users')
  @HttpCode(200)
  @RequireAction('messages.send')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ operationId: 'blockUsers', summary: 'Block contacts on this WhatsApp number' })
  @ZodResponse({ status: 200, type: ChangeBlockedUsersResultDto })
  block(
    @CurrentMembership() m: OrgMembership,
    @Param('phoneId', ParseUUIDPipe) id: string,
    @Body() body: ChangeBlockedUsersDto,
  ) {
    return this.settings.changeBlockedUsers(m.organizationId, id, body.users, false);
  }

  @Delete('blocked-users')
  @RequireAction('messages.send')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ operationId: 'unblockUsers', summary: 'Unblock contacts on this WhatsApp number' })
  @ZodResponse({ type: ChangeBlockedUsersResultDto })
  unblock(
    @CurrentMembership() m: OrgMembership,
    @Param('phoneId', ParseUUIDPipe) id: string,
    @Body() body: ChangeBlockedUsersDto,
  ) {
    return this.settings.changeBlockedUsers(m.organizationId, id, body.users, true);
  }
}
