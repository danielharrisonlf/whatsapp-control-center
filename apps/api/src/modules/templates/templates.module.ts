import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({ imports: [ConnectionsModule], controllers: [TemplatesController], providers: [TemplatesService] })
export class TemplatesModule {}
