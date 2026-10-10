import { Module } from '@nestjs/common';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { DiagnosticsService } from './diagnostics.service';
import { MetaCredentialsService } from './meta-credentials.service';
import { MetaSyncService } from './meta-sync.service';

@Module({
  controllers: [ConnectionsController],
  providers: [ConnectionsService, DiagnosticsService, MetaCredentialsService, MetaSyncService],
  exports: [ConnectionsService, MetaCredentialsService, MetaSyncService],
})
export class ConnectionsModule {}
