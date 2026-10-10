import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({ imports: [ConnectionsModule], controllers: [MediaController], providers: [MediaService] })
export class MediaModule {}
