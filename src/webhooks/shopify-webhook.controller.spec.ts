import { createHmac } from 'crypto';

import { BadRequestException, RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { Request } from 'express';

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

describe('ShopifyWebhookController', () => {
  let controller: ShopifyWebhookController;
  let prisma: {
    webhookInboundEvent: { findUnique: jest.Mock; upsert: jest.Mock; update: jest.Mock };
    integration: { findUnique: jest.Mock };
  };
  let shopifyWebhooks: { handleOrderCreated: jest.Mock };
  let n8nOrchestrator: { startOrderValidationRun: jest.Mock };
  let realtime: { publishOrderUpdate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      webhookInboundEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
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
    prisma.webhookInboundEvent.findUnique.mockResolvedValue({ id: 'already-there', status: 'PROCESSED' });
    const req = buildRequest({ id: 1 });

    await expect(controller.handle('int_1', req)).resolves.toEqual({ received: true });
    expect(shopifyWebhooks.handleOrderCreated).not.toHaveBeenCalled();
    expect(prisma.integration.findUnique).not.toHaveBeenCalled();
  });

  it('re-processes when the existing row is FAILED — a redelivery must not be silently swallowed', async () => {
    prisma.webhookInboundEvent.findUnique.mockResolvedValue({ id: 'already-there', status: 'FAILED' });
    const req = buildRequest({ id: 4001 });

    await expect(controller.handle('int_1', req)).resolves.toEqual({ received: true });
    expect(shopifyWebhooks.handleOrderCreated).toHaveBeenCalled();
    expect(prisma.webhookInboundEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: 'PROCESSING', processedAt: null }),
      }),
    );
  });

  it('acks 200 and records FAILED when no integration matches the path id', async () => {
    prisma.integration.findUnique.mockResolvedValue(null);
    const req = buildRequest({ id: 1 });

    await expect(controller.handle('int_missing', req)).resolves.toEqual({ received: true });
    expect(shopifyWebhooks.handleOrderCreated).not.toHaveBeenCalled();
    expect(prisma.webhookInboundEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: 'FAILED' }) }),
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
  });

  it('acks 200 and records FAILED when the shop header does not match the stored shop', async () => {
    const req = buildRequest({ id: 1 }, { 'x-shopify-shop-domain': 'someone-elses-shop.myshopify.com' });

    await expect(controller.handle('int_1', req)).resolves.toEqual({ received: true });
    expect(shopifyWebhooks.handleOrderCreated).not.toHaveBeenCalled();
    expect(prisma.webhookInboundEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'FAILED' }),
      }),
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

  it('still acks 200 and records FAILED when order processing throws', async () => {
    shopifyWebhooks.handleOrderCreated.mockRejectedValue(new Error('db exploded'));
    const req = buildRequest({ id: 4001 });

    await expect(controller.handle('int_1', req)).resolves.toEqual({ received: true });
    expect(n8nOrchestrator.startOrderValidationRun).not.toHaveBeenCalled();
    expect(prisma.webhookInboundEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } }),
    );
  });

  it('still acks 200 and records FAILED when triggering the n8n workflow fails', async () => {
    n8nOrchestrator.startOrderValidationRun.mockRejectedValue(new Error('n8n unreachable'));
    const req = buildRequest({ id: 4001 });

    await expect(controller.handle('int_1', req)).resolves.toEqual({ received: true });
    expect(prisma.webhookInboundEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } }),
    );
  });
});
