import { Global, Module } from '@nestjs/common';
import { ApiLogService } from './api-log.service';
import { ApiLogsController } from './api-logs.controller';

@Global()
@Module({ controllers: [ApiLogsController], providers: [ApiLogService], exports: [ApiLogService] })
export class ApiLogsModule {}
