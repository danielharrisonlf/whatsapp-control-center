import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { PhoneNumbersController } from './phone-numbers.controller';
import { PhoneNumbersService } from './phone-numbers.service';
import { PhoneQrCodesController } from './phone-qr-codes.controller';
import { PhoneQrCodesService } from './phone-qr-codes.service';
import { PhoneSettingsController } from './phone-settings.controller';
import { PhoneSettingsService } from './phone-settings.service';

@Module({
  imports: [ConnectionsModule],
  controllers: [PhoneNumbersController, PhoneSettingsController, PhoneQrCodesController],
  providers: [PhoneNumbersService, PhoneSettingsService, PhoneQrCodesService],
  exports: [PhoneNumbersService],
})
export class PhoneNumbersModule {}
