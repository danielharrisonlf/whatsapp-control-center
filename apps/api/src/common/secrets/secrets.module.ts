import { Global, Module } from '@nestjs/common';
import { AesGcmSecretService, SecretService } from './secret.service';

@Global()
@Module({
  providers: [{ provide: SecretService, useClass: AesGcmSecretService }],
  exports: [SecretService],
})
export class SecretsModule {}
