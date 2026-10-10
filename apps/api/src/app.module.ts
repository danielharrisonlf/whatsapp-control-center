import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter';
import { RequestContextMiddleware } from './common/http/request-context.middleware';
import { SecretsModule } from './common/secrets/secrets.module';
import { ConfigModule } from './config/config.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ApiLogsModule } from './modules/api-logs/api-logs.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConnectionsModule } from './modules/connections/connections.module';
import { FlowsModule } from './modules/flows/flows.module';
import { HealthController } from './modules/health/health.controller';
import { MediaModule } from './modules/media/media.module';
import { MessagesModule } from './modules/messages/messages.module';
import { MetaModule } from './modules/meta/meta.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PhoneNumbersModule } from './modules/phone-numbers/phone-numbers.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { WabasModule } from './modules/wabas/wabas.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    SecretsModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 600 }]),
    ApiLogsModule,
    AuditModule,
    MetaModule,
    AuthModule,
    OrganizationsModule,
    ConnectionsModule,
    WabasModule,
    PhoneNumbersModule,
    TemplatesModule,
    MessagesModule,
    MediaModule,
    FlowsModule,
    WebhooksModule,
    AnalyticsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
