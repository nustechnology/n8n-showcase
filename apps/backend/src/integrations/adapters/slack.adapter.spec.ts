import nock from 'nock';

import { BadGatewayException, UnauthorizedException } from '@nestjs/common';

import { SlackAdapter } from './slack.adapter';

describe('SlackAdapter', () => {
  let adapter: SlackAdapter;
  const webhookUrl = 'https://hooks.slack.com/services/T00/B00/xxxx';

  beforeEach(() => {
    adapter = new SlackAdapter();
    nock.cleanAll();
  });

  afterAll(() => nock.restore());

  it('sendMessage posts the given text to the webhook URL', async () => {
    nock('https://hooks.slack.com')
      .post('/services/T00/B00/xxxx', { text: 'Order #1001 shipped' })
      .reply(200, 'ok');

    await expect(adapter.sendMessage(webhookUrl, 'Order #1001 shipped')).resolves.toBeUndefined();
  });

  it('sendMessage throws UnauthorizedException on a revoked/invalid webhook', async () => {
    nock('https://hooks.slack.com').post('/services/T00/B00/xxxx').reply(404);
    await expect(adapter.sendMessage(webhookUrl, 'hi')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('sendMessage throws BadGatewayException on any other failure', async () => {
    nock('https://hooks.slack.com').post('/services/T00/B00/xxxx').reply(500);
    await expect(adapter.sendMessage(webhookUrl, 'hi')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('validateKey/testConnection both post a real, visible message (no dry-run endpoint exists)', async () => {
    const scope = nock('https://hooks.slack.com').post('/services/T00/B00/xxxx').twice().reply(200, 'ok');

    await adapter.validateKey(webhookUrl);
    await adapter.testConnection(webhookUrl);

    expect(scope.isDone()).toBe(true);
  });
});
