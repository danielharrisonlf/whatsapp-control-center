import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { MetaWebhookController } from './meta-webhook.controller';
import { WebhookEventsController } from './webhook-events.controller';
import { WebhookEventsService } from './webhook-events.service';
import { WebhookProcessorService } from './webhook-processor.service';
import { WebhookReceiverService } from './webhook-receiver.service';

@Module({
  imports: [ConnectionsModule],
  controllers: [MetaWebhookController, WebhookEventsController],
  providers: [WebhookReceiverService, WebhookProcessorService, WebhookEventsService],
})
export class WebhooksModule {}
