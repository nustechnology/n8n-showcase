import { Prisma } from '@prisma/client';

import { claimWebhookInboundEvent } from './webhook-inbox-claim.util';

const DUPLICATE_KEY_ERROR = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
  code: 'P2002',
  clientVersion: '5.22.0',
});

describe('claimWebhookInboundEvent', () => {
  let prisma: { webhookInboundEvent: { create: jest.Mock; updateMany: jest.Mock } };

  const input = {
    source: 'SHOPIFY' as const,
    externalId: 'wh_1',
    tenantId: 't_1',
    payload: { id: 1 },
    headers: { shop: 'acme.myshopify.com' },
  };

  beforeEach(() => {
    prisma = {
      webhookInboundEvent: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
  });

  it('claims a brand-new event via create()', async () => {
    const claimed = await claimWebhookInboundEvent(prisma as never, input);

    expect(claimed).toBe(true);
    expect(prisma.webhookInboundEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSING' }) }),
    );
    expect(prisma.webhookInboundEvent.updateMany).not.toHaveBeenCalled();
  });

  it('reclaims an existing FAILED row via an atomic updateMany', async () => {
    prisma.webhookInboundEvent.create.mockRejectedValue(DUPLICATE_KEY_ERROR);
    prisma.webhookInboundEvent.updateMany.mockResolvedValue({ count: 1 });

    const claimed = await claimWebhookInboundEvent(prisma as never, input);

    expect(claimed).toBe(true);
    expect(prisma.webhookInboundEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { source: 'SHOPIFY', externalId: 'wh_1', status: 'FAILED' },
        data: expect.objectContaining({ status: 'PROCESSING', processedAt: null }),
      }),
    );
  });

  it('does not claim when the row exists but is not FAILED (already processed or in flight)', async () => {
    prisma.webhookInboundEvent.create.mockRejectedValue(DUPLICATE_KEY_ERROR);
    prisma.webhookInboundEvent.updateMany.mockResolvedValue({ count: 0 });

    const claimed = await claimWebhookInboundEvent(prisma as never, input);

    expect(claimed).toBe(false);
  });

  it('lets a concurrent retry of the same FAILED row lose if it is not first', async () => {
    prisma.webhookInboundEvent.create.mockRejectedValue(DUPLICATE_KEY_ERROR);
    // Simulates the loser of a concurrent updateMany race: the winner's
    // update already flipped status away from FAILED, so this one matches
    // zero rows.
    prisma.webhookInboundEvent.updateMany.mockResolvedValue({ count: 0 });

    const claimed = await claimWebhookInboundEvent(prisma as never, input);

    expect(claimed).toBe(false);
  });

  it('rethrows a non-P2002 error from create()', async () => {
    const other = new Error('connection lost');
    prisma.webhookInboundEvent.create.mockRejectedValue(other);

    await expect(claimWebhookInboundEvent(prisma as never, input)).rejects.toBe(other);
    expect(prisma.webhookInboundEvent.updateMany).not.toHaveBeenCalled();
  });
});
