import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { FlowsController } from './flows.controller';
import { FlowsService } from './flows.service';

@Module({ imports: [ConnectionsModule], controllers: [FlowsController], providers: [FlowsService] })
export class FlowsModule {}
