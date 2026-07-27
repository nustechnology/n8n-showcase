import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { ShopifyWebhookService } from './shopify-webhook.service';

describe('ShopifyWebhookService', () => {
  let service: ShopifyWebhookService;
  let prisma: { order: { upsert: jest.Mock }; orderEvent: { create: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      order: { upsert: jest.fn().mockResolvedValue({ id: 'order_1', tenantId: 't_1' }) },
      orderEvent: { create: jest.fn().mockResolvedValue({}) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ShopifyWebhookService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(ShopifyWebhookService);
  });

  it('upserts an Order and appends an order_received event, returning the order', async () => {
    const result = await service.handleOrderCreated(
      { id: 'int_1', tenantId: 't_1' },
      {
        id: 4001,
        email: 'buyer@example.com',
        currency: 'USD',
        total_price: '129.99',
        customer: { first_name: 'Ada', last_name: 'Lovelace', email: 'buyer@example.com' },
      },
    );

    expect(result).toEqual({ id: 'order_1', tenantId: 't_1' });
    expect(prisma.order.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_shopifyOrderId: { tenantId: 't_1', shopifyOrderId: '4001' } },
        create: expect.objectContaining({
          tenantId: 't_1',
          shopifyOrderId: '4001',
          status: 'RECEIVED',
          customerEmail: 'buyer@example.com',
          customerName: 'Ada Lovelace',
          currency: 'USD',
          totalAmount: '129.99',
        }),
      }),
    );
    expect(prisma.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderId: 'order_1', tenantId: 't_1', eventType: 'order_received' }),
      }),
    );
  });

  it('falls back to the top-level email when there is no customer object', async () => {
    await service.handleOrderCreated(
      { id: 'int_1', tenantId: 't_1' },
      { id: 4002, email: 'guest@example.com' },
    );

    expect(prisma.order.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ customerEmail: 'guest@example.com', customerName: null }),
      }),
    );
  });
});
