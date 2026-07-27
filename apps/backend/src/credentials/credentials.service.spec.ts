import { randomBytes } from 'crypto';

import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { CredentialsService } from './credentials.service';

describe('CredentialsService', () => {
  let service: CredentialsService;
  const key = randomBytes(32).toString('base64');

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CredentialsService,
        { provide: ConfigService, useValue: { getOrThrow: () => key } },
      ],
    }).compile();

    service = moduleRef.get(CredentialsService);
    service.onModuleInit();
  });

  it('throws at init if the key is not exactly 32 bytes after base64 decode', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CredentialsService,
        { provide: ConfigService, useValue: { getOrThrow: () => Buffer.from('too-short').toString('base64') } },
      ],
    }).compile();
    const badService = moduleRef.get(CredentialsService);

    expect(() => badService.onModuleInit()).toThrow(/32 bytes/);
  });

  it('round-trips plaintext through encrypt/decrypt', () => {
    const payload = service.encrypt('shpat_super_secret_token', 'integration_1');
    expect(service.decrypt(payload, 'integration_1')).toBe('shpat_super_secret_token');
  });

  it('stamps keyVersion explicitly', () => {
    const payload = service.encrypt('secret', 'integration_1');
    expect(payload.keyVersion).toBe(1);
  });

  it('produces a different iv/ciphertext on every call (no IV reuse)', () => {
    const a = service.encrypt('secret', 'integration_1');
    const b = service.encrypt('secret', 'integration_1');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('rejects decryption with the wrong AAD (integration id mismatch)', () => {
    const payload = service.encrypt('secret', 'integration_1');
    expect(() => service.decrypt(payload, 'integration_2')).toThrow();
  });

  it('rejects decryption of a tampered ciphertext', () => {
    const payload = service.encrypt('secret', 'integration_1');
    const tampered = { ...payload, ciphertext: Buffer.from('tampered-bytes').toString('base64') };
    expect(() => service.decrypt(tampered, 'integration_1')).toThrow();
  });

  it('rejects decryption of a tampered authTag', () => {
    const payload = service.encrypt('secret', 'integration_1');
    const tampered = { ...payload, authTag: Buffer.from(payload.authTag, 'base64').fill(0).toString('base64') };
    expect(() => service.decrypt(tampered, 'integration_1')).toThrow();
  });

  it('builds a masked display hint from the last 4 characters', () => {
    expect(service.buildDisplayHint('sk_live_abcd1234')).toBe('••••1234');
  });
});
