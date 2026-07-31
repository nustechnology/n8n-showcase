import { createHmac } from 'crypto';

import { BadRequestException, RawBodyRequest, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { Request } from 'express';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { N8nOrchestratorService } from '../internal/n8n-orchestrator.service';

import { RealtimeService } from '../realtime/realtime.service';

import { ShopifyWebhookController } from './shopify-webhook.controller';
import { ShopifyWebhookService } from './shopify-webhook.service';

const SECRET = 'test-shopify-secret';

function sign(rawBody: Buffer): string {
  return createHmac('sha256', SECRET).update(rawBody).digest('base64');
}

function buildRequest(
  payload: object,
  overrides: Partial<Record<string, string>> = {},
): RawBodyRequest<Request> {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const headers: Record<string, string> = {
    'x-shopify-hmac-sha256': sign(rawBody),
    'x-shopify-shop-domain': 'acme.myshopify.com',
    'x-shopify-webhook-id': 'wh_evt_1',
    ...overrides,
  };
  return { rawBody, headers } as unknown as RawBodyRequest<Request>;
}

const DUPLICATE_KEY_ERROR = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
  code: 'P2002',
  clientVersion: '5.22.0',
});

describe('ShopifyWebhookController', () => {
  let controller: ShopifyWebhookController;
  let prisma: {
    webhookInboundEvent: { create: jest.Mock; updateMany: jest.Mock; update: jest.Mock };
    integration: { findUnique: jest.Mock };
  };
  let shopifyWebhooks: { handleOrderCreated: jest.Mock };
  let n8nOrchestrator: { startOrderValidationRun: jest.Mock };
  let realtime: { publishOrderUpdate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      webhookInboundEvent: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      integration: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'int_1',
          tenantId: 't_1',
          status: 'ACTIVE',
          config: { shop: 'acme.myshopify.com' },
        }),
      },
    };
    shopifyWebhooks = {
      handleOrderCreated: jest.fn().mockResolvedValue({ id: 'order_1', tenantId: 't_1', status: 'RECEIVED' }),
    };
    n8nOrchestrator = { startOrderValidationRun: jest.fn().mockResolvedValue(undefined) };
    realtime = { publishOrderUpdate: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [ShopifyWebhookController],
      providers: [
        { provide: ConfigService, useValue: { get: () => SECRET, getOrThrow: () => SECRET } },
        { provide: PrismaService, useValue: prisma },
        { provide: ShopifyWebhookService, useValue: shopifyWebhooks },
        { provide: N8nOrchestratorService, useValue: n8nOrchestrator },
        { provide: RealtimeService, useValue: realtime },
      ],
    }).compile();

    controller = moduleRef.get(ShopifyWebhookController);
  });

  it('rejects a request with no raw body', async () => {
    const req = { rawBody: undefined, headers: {} } as unknown as RawBodyRequest<Request>;
    await expect(controller.handle('int_1', req)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a request missing required Shopify headers', async () => {
    const req = buildRequest({ id: 1 });
    delete (req.headers as Record<string, unknown>)['x-shopify-hmac-sha256'];
    await expect(controller.handle('int_1', req)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid signature', async () => {
    const req = buildRequest({ id: 1 });
    (req.headers as Record<string, string>)['x-shopify-hmac-sha256'] = 'not-the-real-signature';
    await expect(controller.handle('int_1', req)).rejects.toBeInstanceOf(BadRequestException);
    expect(shopifyWebhooks.handleOrderCreated).not.toHaveBeenCalled();
  });

  it('is idempotent: a previously-PROCESSED webhook id is acked without re-processing', async () => {
    prisma.webhookInboundEvent.create.mockRejectedValue(DUPLICATE_KEY_ERROR);
    prisma.webhookInboundEvent.updateMany.mockResolvedValue({ count: 0 }); // not FAILED, so not reclaimable
    const req = buildRequest({ id: 1 });

    await expect(controller.handle('int_1', req)).resolves.toEqual({ received: true });
    expect(shopifyWebhooks.handleOrderCreated).not.toHaveBeenCalled();
  });

  it('re-processes when the existing row is FAILED — a redelivery must not be silently swallowed', async () => {
    prisma.webhookInboundEvent.create.mockRejectedValue(DUPLICATE_KEY_ERROR);
    prisma.webhookInboundEvent.updateMany.mockResolvedValue({ count: 1 }); // reclaimed a FAILED row
    const req = buildRequest({ id: 4001 });

    await expect(controller.handle('int_1', req)).resolves.toEqual({ received: true });
    expect(shopifyWebhooks.handleOrderCreated).toHaveBeenCalled();
    expect(prisma.webhookInboundEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'FAILED' }),
        data: expect.objectContaining({ status: 'PROCESSING', processedAt: null }),
      }),
    );
  });

  it('acks 200 and records FAILED when no integration matches the path id', async () => {
    prisma.integration.findUnique.mockResolvedValue(null);
    const req = buildRequest({ id: 1 });

    await expect(controller.handle('int_missing', req)).resolves.toEqual({ received: true });
    expect(shopifyWebhooks.handleOrderCreated).not.toHaveBeenCalled();
    expect(prisma.webhookInboundEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSING' }) }),
    );
    expect(prisma.webhookInboundEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } }),
    );
  });

  it('acks 200 and records FAILED when the integration is not ACTIVE', async () => {
    prisma.integration.findUnique.mockResolvedValue({
      id: 'int_1',
      tenantId: 't_1',
      status: 'DEGRADED',
      config: { shop: 'acme.myshopify.com' },
    });
    const req = buildRequest({ id: 1 });

    await expect(controller.handle('int_1', req)).resolves.toEqual({ received: true });
    expect(shopifyWebhooks.handleOrderCreated).not.toHaveBeenCalled();
    expect(prisma.webhookInboundEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } }),
    );
  });

  it('acks 200 and records FAILED when the shop header does not match the stored shop', async () => {
    const req = buildRequest({ id: 1 }, { 'x-shopify-shop-domain': 'someone-elses-shop.myshopify.com' });

    await expect(controller.handle('int_1', req)).resolves.toEqual({ received: true });
    expect(shopifyWebhooks.handleOrderCreated).not.toHaveBeenCalled();
    expect(prisma.webhookInboundEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } }),
    );
  });

  it('processes a genuinely signed, matching webhook end to end, then triggers the n8n workflow', async () => {
    const req = buildRequest({ id: 4001, email: 'buyer@example.com' });

    await expect(controller.handle('int_1', req)).resolves.toEqual({ received: true });

    expect(shopifyWebhooks.handleOrderCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'int_1', tenantId: 't_1' }),
      expect.objectContaining({ id: 4001, email: 'buyer@example.com' }),
    );
    expect(realtime.publishOrderUpdate).toHaveBeenCalledWith({
      tenantId: 't_1',
      orderId: 'order_1',
      status: 'RECEIVED',
      type: 'order_created',
    });
    expect(n8nOrchestrator.startOrderValidationRun).toHaveBeenCalledWith({
      tenantId: 't_1',
      orderId: 'order_1',
      correlationId: expect.any(String),
    });
    expect(prisma.webhookInboundEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PROCESSED', processedAt: expect.any(Date) } }),
    );
  });

  it('rejects two concurrent deliveries of the same webhook id from both processing it', async () => {
    // Simulates the DB unique constraint doing its job: the second
    // concurrent `create()` for the same externalId loses the race and
    // gets a P2002, same as it would against a real Postgres instance.
    prisma.webhookInboundEvent.create
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(DUPLICATE_KEY_ERROR);
    prisma.webhookInboundEvent.updateMany.mockResolvedValue({ count: 0 }); // not FAILED — second request backs off
    const req1 = buildRequest({ id: 4001 });
    const req2 = buildRequest({ id: 4001 });

    const [first, second] = await Promise.all([
      controller.handle('int_1', req1),
      controller.handle('int_1', req2),
    ]);

    expect(first).toEqual({ received: true });
    expect(second).toEqual({ received: true });
    expect(shopifyWebhooks.handleOrderCreated).toHaveBeenCalledTimes(1);
  });

  it('returns 503 (not 200) when order processing throws, so Shopify retries automatically', async () => {
    shopifyWebhooks.handleOrderCreated.mockRejectedValue(new Error('db exploded'));
    const req = buildRequest({ id: 4001 });

    await expect(controller.handle('int_1', req)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(n8nOrchestrator.startOrderValidationRun).not.toHaveBeenCalled();
    expect(prisma.webhookInboundEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } }),
    );
  });

  it('returns 503 (not 200) when triggering the n8n workflow fails, so Shopify retries automatically', async () => {
    n8nOrchestrator.startOrderValidationRun.mockRejectedValue(new Error('n8n unreachable'));
    const req = buildRequest({ id: 4001 });

    await expect(controller.handle('int_1', req)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.webhookInboundEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } }),
    );
  });
});
