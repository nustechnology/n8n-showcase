import nock from 'nock';

import { BadGatewayException, UnauthorizedException } from '@nestjs/common';

import { ResendAdapter } from './resend.adapter';

describe('ResendAdapter', () => {
  let adapter: ResendAdapter;

  beforeEach(() => {
    adapter = new ResendAdapter();
    nock.cleanAll();
  });

  afterAll(() => nock.restore());

  it('testConnection succeeds against a valid API key', async () => {
    nock('https://api.resend.com')
      .get('/domains')
      .matchHeader('authorization', 'Bearer re_valid_key')
      .reply(200, { data: [] });

    await expect(adapter.testConnection('re_valid_key')).resolves.toBeUndefined();
  });

  it('testConnection throws UnauthorizedException on 401', async () => {
    nock('https://api.resend.com').get('/domains').reply(401);

    await expect(adapter.testConnection('re_bad_key')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  // Caught by live testing against a real Resend key: a "sending_access"
  // (restricted) key is genuinely valid but can't call GET /domains at
  // all — Resend returns 401 with name: "restricted_api_key", which is a
  // fundamentally different situation from an actually-wrong key.
  it('gives a distinct, honest message for a valid-but-sending-only key', async () => {
    nock('https://api.resend.com')
      .get('/domains')
      .reply(401, { statusCode: 401, message: 'This API key is restricted to only send emails', name: 'restricted_api_key' });

    await expect(adapter.testConnection('re_sending_only_key')).rejects.toThrow(/restricted to sending only/);
  });

  it('testConnection throws BadGatewayException on a non-auth failure', async () => {
    nock('https://api.resend.com').get('/domains').reply(500);

    await expect(adapter.testConnection('re_valid_key')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('validateKey delegates to testConnection', async () => {
    nock('https://api.resend.com').get('/domains').reply(200, { data: [] });

    await expect(adapter.validateKey('re_valid_key')).resolves.toBeUndefined();
  });
});
