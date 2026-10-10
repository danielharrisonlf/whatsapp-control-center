import { Global, Module } from '@nestjs/common';
import { MetaAnalyticsService } from './meta-analytics.service';
import { MetaAuthService } from './meta-auth.service';
import { MetaBusinessService } from './meta-business.service';
import { MetaFlowService } from './meta-flow.service';
import { MetaGraphClient } from './meta-graph.client';
import { MetaMediaService } from './meta-media.service';
import { MetaMessageService } from './meta-message.service';
import { MetaPhoneNumberService } from './meta-phone-number.service';
import { MetaPhoneSettingsService } from './meta-phone-settings.service';
import { MetaQrCodeService } from './meta-qr-code.service';
import { MetaTemplateService } from './meta-template.service';
import { MetaUploadService } from './meta-upload.service';
import { MetaWabaService } from './meta-waba.service';

const services = [
  MetaGraphClient,
  MetaAuthService,
  MetaBusinessService,
  MetaWabaService,
  MetaPhoneNumberService,
  MetaPhoneSettingsService,
  MetaQrCodeService,
  MetaTemplateService,
  MetaMessageService,
  MetaMediaService,
  MetaFlowService,
  MetaUploadService,
  MetaAnalyticsService,
];

/** Isolated Meta Graph API layer. Domain modules use these services; nothing else calls Meta. */
@Global()
@Module({ providers: services, exports: services })
export class MetaModule {}
