import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';

/**
 * Encrypts secrets before they reach the database.
 *
 * `context` is bound as additional authenticated data (AAD): a ciphertext copied to another
 * row or column fails to decrypt. Implementations backed by AWS KMS, Vault or GCP Secret
 * Manager can replace the default one by providing another class for this token.
 */
export abstract class SecretService {
  abstract encrypt(plaintext: string, context: string): Promise<string>;
  abstract decrypt(ciphertext: string, context: string): Promise<string>;
}

const VERSION = 'v1';

/**
 * AES-256-GCM with a key from the environment.
 * Format: `v1.<keyId>.<iv b64url>.<tag b64url>.<ciphertext b64url>`.
 */
@Injectable()
export class AesGcmSecretService extends SecretService {
  private readonly keys: Map<string, Buffer>;
  private readonly activeKeyId: string;

  constructor(@Inject(ENV) env: Pick<Env, 'SECRETS_ENCRYPTION_KEY' | 'SECRETS_ENCRYPTION_KEY_ID'>) {
    super();
    this.activeKeyId = env.SECRETS_ENCRYPTION_KEY_ID;
    this.keys = new Map([[env.SECRETS_ENCRYPTION_KEY_ID, Buffer.from(env.SECRETS_ENCRYPTION_KEY, 'base64')]]);
  }

  async encrypt(plaintext: string, context: string): Promise<string> {
    const key = this.keys.get(this.activeKeyId)!;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      this.activeKeyId,
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  async decrypt(value: string, context: string): Promise<string> {
    const [version, keyId, iv, tag, ciphertext] = value.split('.');
    if (version !== VERSION || !keyId || !iv || !tag || ciphertext === undefined) {
      throw new Error('Unsupported secret format');
    }
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`Unknown secret key id "${keyId}"`);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString(
      'utf8',
    );
  }
}

/** `EAAJ•••••••93A`: enough to recognize a token, never enough to use it. */
export function maskSecret(secret: string, visibleStart = 4, visibleEnd = 3): string {
  if (secret.length <= visibleStart + visibleEnd + 2) return '•'.repeat(Math.max(secret.length, 6));
  return `${secret.slice(0, visibleStart)}•••••••${secret.slice(-visibleEnd)}`;
}
