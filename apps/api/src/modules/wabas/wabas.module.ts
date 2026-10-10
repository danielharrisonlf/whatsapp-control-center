import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { WabasController } from './wabas.controller';
import { WabasService } from './wabas.service';

@Module({ imports: [ConnectionsModule], controllers: [WabasController], providers: [WabasService] })
export class WabasModule {}
