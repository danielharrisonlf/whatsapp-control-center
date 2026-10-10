import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { SuccessDto } from '../../common/dto';
import { CurrentMembership, type OrgMembership, RequireAction } from '../auth/auth.decorators';
import {
  CreatePhoneQrCodeDto,
  PhoneQrCodeDto,
  PhoneQrCodeListDto,
  QrCodeParamsDto,
  UpdatePhoneQrCodeDto,
} from './phone-qr-codes.dto';
import { PhoneQrCodesService } from './phone-qr-codes.service';

@ApiTags('Phone numbers')
@Controller('organizations/:organizationId/phone-numbers/:phoneId/qr-codes')
export class PhoneQrCodesController {
  constructor(private readonly qr: PhoneQrCodesService) {}

  @Get()
  @ApiOperation({ operationId: 'listPhoneQrCodes' })
  @ZodResponse({ type: PhoneQrCodeListDto })
  list(@CurrentMembership() m: OrgMembership, @Param('phoneId', ParseUUIDPipe) id: string) {
    return this.qr.list(m.organizationId, id);
  }

  @Post()
  @RequireAction('phones.manage')
  @ApiOperation({ operationId: 'createPhoneQrCode' })
  @ZodResponse({ status: 201, type: PhoneQrCodeDto })
  create(
    @CurrentMembership() m: OrgMembership,
    @Param('phoneId', ParseUUIDPipe) id: string,
    @Body() body: CreatePhoneQrCodeDto,
  ) {
    return this.qr.create(m.organizationId, id, body);
  }

  @Get(':code')
  @ApiOperation({ operationId: 'getPhoneQrCode' })
  @ZodResponse({ type: PhoneQrCodeDto })
  get(@CurrentMembership() m: OrgMembership, @Param() params: QrCodeParamsDto) {
    return this.qr.get(m.organizationId, params.phoneId, params.code);
  }

  @Patch(':code')
  @RequireAction('phones.manage')
  @ApiOperation({ operationId: 'updatePhoneQrCode' })
  @ZodResponse({ type: PhoneQrCodeDto })
  update(
    @CurrentMembership() m: OrgMembership,
    @Param() params: QrCodeParamsDto,
    @Body() body: UpdatePhoneQrCodeDto,
  ) {
    return this.qr.update(m.organizationId, params.phoneId, params.code, body.prefilledMessage);
  }

  @Delete(':code')
  @RequireAction('phones.manage')
  @ApiOperation({ operationId: 'deletePhoneQrCode' })
  @ZodResponse({ type: SuccessDto })
  delete(@CurrentMembership() m: OrgMembership, @Param() params: QrCodeParamsDto) {
    return this.qr.delete(m.organizationId, params.phoneId, params.code);
  }
}
