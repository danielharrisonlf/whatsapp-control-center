import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({ imports: [ConnectionsModule], controllers: [AnalyticsController], providers: [AnalyticsService] })
export class AnalyticsModule {}
