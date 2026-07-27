import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_VERSION = 1;

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

/**
 * AES-256-GCM for third-party API keys/tokens (IntegrationCredential).
 * Every call binds AAD to the credential's `integrationId` — that table
 * deliberately has no `tenantId` column (isolation is via the
 * `integrationId` FK join), so AAD binding means a ciphertext/iv/authTag
 * triple copied or swapped between rows (bug, bad migration, restore
 * mismatch) fails to decrypt instead of silently succeeding against the
 * wrong row.
 */
@Injectable()
export class CredentialsService implements OnModuleInit {
  private key!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const raw = this.config.getOrThrow<string>('CREDENTIALS_ENCRYPTION_KEY');
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new Error(
        `CREDENTIALS_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}) — generate one with: openssl rand -base64 32`,
      );
    }
    this.key = key;
  }

  encrypt(plaintext: string, aad: string): EncryptedPayload {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    cipher.setAAD(Buffer.from(aad));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      // Stamped explicitly rather than left to the schema default — if the
      // key is ever rotated out-of-band before real rotation logic exists,
      // rows still say which key actually encrypted them.
      keyVersion: KEY_VERSION,
    };
  }

  decrypt(
    payload: { ciphertext: string; iv: string; authTag: string },
    aad: string,
  ): string {
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(payload.iv, 'base64'));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }

  buildDisplayHint(secret: string): string {
    return `••••${secret.slice(-4)}`;
  }
}
