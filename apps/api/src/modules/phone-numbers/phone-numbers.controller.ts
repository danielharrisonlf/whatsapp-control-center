import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, type ApiBodyOptions, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ZodResponse } from 'nestjs-zod';
import { SuccessDto, success } from '../../common/dto';
import { CurrentMembership, type OrgMembership, RequireAction } from '../auth/auth.decorators';
import {
  AddPhoneDto,
  BusinessProfileDto,
  PhoneListQueryDto,
  PhoneNumberDto,
  PhoneNumberListDto,
  RegisterPhoneDto,
  RequestCodeDto,
  TwoStepPinDto,
  UpdateBusinessProfileDto,
  UpdatePhoneDto,
  VerifyCodeDto,
} from './phone-numbers.dto';
import { PhoneNumbersService } from './phone-numbers.service';

const fileBody: ApiBodyOptions = {
  schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] },
};

@ApiTags('Phone numbers')
@Controller('organizations/:organizationId/phone-numbers')
export class PhoneNumbersController {
  constructor(private readonly phones: PhoneNumbersService) {}

  @Get()
  @ApiOperation({ operationId: 'listPhoneNumbers' })
  @ZodResponse({ type: PhoneNumberListDto })
  list(@CurrentMembership() m: OrgMembership, @Query() q: PhoneListQueryDto) {
    return this.phones.list(m.organizationId, q.wabaId);
  }

  @Post()
  @RequireAction('phones.manage')
  @ApiOperation({
    operationId: 'addPhoneNumber',
    summary: 'Add a phone number to a WABA (then verify and register it)',
  })
  @ZodResponse({ status: 201, type: PhoneNumberDto })
  add(@CurrentMembership() m: OrgMembership, @Body() body: AddPhoneDto) {
    return this.phones.add(m.organizationId, body);
  }

  @Get(':phoneId')
  @ApiOperation({ operationId: 'getPhoneNumber' })
  @ZodResponse({ type: PhoneNumberDto })
  get(@CurrentMembership() m: OrgMembership, @Param('phoneId', ParseUUIDPipe) id: string) {
    return this.phones.get(m.organizationId, id);
  }

  @Patch(':phoneId')
  @RequireAction('phones.manage')
  @ApiOperation({ operationId: 'updatePhoneNumber', summary: 'Update local-only fields (label)' })
  @ZodResponse({ type: PhoneNumberDto })
  update(
    @CurrentMembership() m: OrgMembership,
    @Param('phoneId', ParseUUIDPipe) id: string,
    @Body() body: UpdatePhoneDto,
  ) {
    return this.phones.updateLabel(m.organizationId, id, body.displayLabel);
  }

  @Post(':phoneId/sync')
  @HttpCode(200)
  @RequireAction('wabas.sync')
  @ApiOperation({ operationId: 'syncPhoneNumber', summary: 'Refresh status, quality and limits from Meta' })
  @ZodResponse({ status: 200, type: PhoneNumberDto })
  sync(@CurrentMembership() m: OrgMembership, @Param('phoneId', ParseUUIDPipe) id: string) {
    return this.phones.refresh(m.organizationId, id);
  }

  @Post(':phoneId/request-code')
  @HttpCode(200)
  @RequireAction('phones.manage')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    operationId: 'requestVerificationCode',
    summary: 'Send a verification code by SMS or voice call',
  })
  @ZodResponse({ status: 200, type: SuccessDto })
  async requestCode(
    @CurrentMembership() m: OrgMembership,
    @Param('phoneId', ParseUUIDPipe) id: string,
    @Body() body: RequestCodeDto,
  ) {
    await this.phones.requestCode(m.organizationId, id, body);
    return success;
  }

  @Post(':phoneId/verify-code')
  @HttpCode(200)
  @RequireAction('phones.manage')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ operationId: 'verifyCode' })
  @ZodResponse({ status: 200, type: PhoneNumberDto })
  verifyCode(
    @CurrentMembership() m: OrgMembership,
    @Param('phoneId', ParseUUIDPipe) id: string,
    @Body() body: VerifyCodeDto,
  ) {
    return this.phones.verifyCode(m.organizationId, id, body.code);
  }

  @Post(':phoneId/register')
  @HttpCode(200)
  @RequireAction('phones.manage')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    operationId: 'registerPhoneNumber',
    summary: 'Register for Cloud API (limit: 10 register/deregister per 72h)',
  })
  @ZodResponse({ status: 200, type: PhoneNumberDto })
  register(
    @CurrentMembership() m: OrgMembership,
    @Param('phoneId', ParseUUIDPipe) id: string,
    @Body() body: RegisterPhoneDto,
  ) {
    return this.phones.register(m.organizationId, id, body);
  }

  @Post(':phoneId/deregister')
  @HttpCode(200)
  @RequireAction('phones.manage')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    operationId: 'deregisterPhoneNumber',
    summary: 'Deregister from Cloud API. Stops sending and receiving.',
  })
  @ZodResponse({ status: 200, type: PhoneNumberDto })
  deregister(@CurrentMembership() m: OrgMembership, @Param('phoneId', ParseUUIDPipe) id: string) {
    return this.phones.deregister(m.organizationId, id);
  }

  @Post(':phoneId/two-step-pin')
  @HttpCode(200)
  @RequireAction('phones.manage')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ operationId: 'setTwoStepPin', summary: 'Set or change the two-step verification PIN' })
  @ZodResponse({ status: 200, type: SuccessDto })
  async setPin(
    @CurrentMembership() m: OrgMembership,
    @Param('phoneId', ParseUUIDPipe) id: string,
    @Body() body: TwoStepPinDto,
  ) {
    await this.phones.setTwoStepPin(m.organizationId, id, body.pin);
    return success;
  }

  @Get(':phoneId/business-profile')
  @ApiOperation({ operationId: 'getBusinessProfile' })
  @ZodResponse({ type: BusinessProfileDto })
  profile(@CurrentMembership() m: OrgMembership, @Param('phoneId', ParseUUIDPipe) id: string) {
    return this.phones.getBusinessProfile(m.organizationId, id);
  }

  @Patch(':phoneId/business-profile')
  @RequireAction('profile.update')
  @ApiOperation({ operationId: 'updateBusinessProfile' })
  @ZodResponse({ type: BusinessProfileDto })
  updateProfile(
    @CurrentMembership() m: OrgMembership,
    @Param('phoneId', ParseUUIDPipe) id: string,
    @Body() body: UpdateBusinessProfileDto,
  ) {
    return this.phones.updateBusinessProfile(m.organizationId, id, body);
  }

  @Post(':phoneId/business-profile/photo')
  @HttpCode(200)
  @RequireAction('profile.update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @ApiOperation({
    operationId: 'uploadProfilePhoto',
    summary: 'Upload a JPEG/PNG profile photo (Resumable Upload API)',
  })
  @ZodResponse({ status: 200, type: BusinessProfileDto })
  photo(
    @CurrentMembership() m: OrgMembership,
    @Param('phoneId', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.phones.updateProfilePhoto(m.organizationId, id, file);
  }
}
