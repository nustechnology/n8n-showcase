import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';
import { CircuitOpenException } from '../common/circuit-breaker/circuit-open.exception';

import { IntegrationsService } from '../integrations/integrations.service';

import { IntegrationActionsService } from './integration-actions.service';

// Kept for manually re-testing the EasyPost flow end-to-end against an
// order whose Shopify payload has no real shipping address — createShipment()
// used to silently fall back to this and ship there; it now throws instead
// (see integration-actions.service.ts). Wire this back in by hand if that
// kind of manual testing is needed again, don't restore the automatic fallback.
const LOCAL_TEST_FALLBACK_ADDRESS = {
  name: 'Test Customer',
  street1: '164 Townsend St',
  city: 'San Francisco',
  state: 'CA',
  postalCode: '94107',
  country: 'US',
};

describe('IntegrationActionsService', () => {
  let service: IntegrationActionsService;
  let prisma: {
    order: { findFirst: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
    integration: { findFirst: jest.Mock };
  };
  let integrations: {
    getDecryptedCredential: jest.Mock;
    getAdapter: jest.Mock;
    updateCredential: jest.Mock;
  };
  let circuitBreaker: { fire: jest.Mock };
  let zohoAdapter: { checkInventory: jest.Mock; refreshToken: jest.Mock };
  let easyPostAdapter: { createShipment: jest.Mock };
  let shopifyAdapter: { updateOrder: jest.Mock };
  let slackAdapter: { sendMessage: jest.Mock };

  beforeEach(async () => {
    prisma = {
      order: { findFirst: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
      integration: { findFirst: jest.fn() },
    };
    zohoAdapter = { checkInventory: jest.fn(), refreshToken: jest.fn() };
    easyPostAdapter = { createShipment: jest.fn() };
    shopifyAdapter = { updateOrder: jest.fn() };
    slackAdapter = { sendMessage: jest.fn() };
    integrations = {
      getDecryptedCredential: jest.fn(),
      getAdapter: jest.fn(),
      updateCredential: jest.fn(),
    };
    circuitBreaker = { fire: jest.fn((_provider: string, action: () => Promise<unknown>) => action()) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        IntegrationActionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: IntegrationsService, useValue: integrations },
        { provide: CircuitBreakerService, useValue: circuitBreaker },
      ],
    }).compile();

    service = moduleRef.get(IntegrationActionsService);
  });

  describe('checkInventory', () => {
    const order = {
      id: 'o_1',
      tenantId: 't_1',
      shopifyOrderId: '4001',
      rawPayload: { line_items: [{ sku: 'SKU-1', quantity: 2 }, { sku: '', quantity: 1 }] },
    };

    it('extracts only SKU-bearing line items and calls Zoho with the resolved organizationId', async () => {
      prisma.order.findFirst.mockResolvedValue(order);
      prisma.integration.findFirst.mockResolvedValue({ provider: 'ZOHO_INVENTORY' });
      integrations.getDecryptedCredential.mockResolvedValue({
        integrationId: 'int_1',
        secret: 'secret-1',
        config: { organizationId: 'org_1' },
      });
      integrations.getAdapter.mockReturnValue(zohoAdapter);
      zohoAdapter.checkInventory.mockResolvedValue({ inStock: true, availableQuantity: 5 });

      const result = await service.checkInventory('t_1', 'o_1');

      expect(zohoAdapter.checkInventory).toHaveBeenCalledWith(
        'secret-1',
        [{ sku: 'SKU-1', quantity: 2 }],
        'org_1',
      );
      expect(result).toEqual({ inStock: true, availableQuantity: 5 });
    });

    it('refreshes the token once on a 401 (UnauthorizedException) and retries', async () => {
      prisma.order.findFirst.mockResolvedValue(order);
      prisma.integration.findFirst.mockResolvedValue({ provider: 'ZOHO_INVENTORY' });
      integrations.getDecryptedCredential.mockResolvedValue({
        integrationId: 'int_1',
        secret: 'stale-secret',
        config: { organizationId: 'org_1' },
      });
      integrations.getAdapter.mockReturnValue(zohoAdapter);
      zohoAdapter.checkInventory
        .mockRejectedValueOnce(new UnauthorizedException('expired'))
        .mockResolvedValueOnce({ inStock: true });
      zohoAdapter.refreshToken.mockResolvedValue('fresh-secret');

      const result = await service.checkInventory('t_1', 'o_1');

      expect(zohoAdapter.refreshToken).toHaveBeenCalledWith('stale-secret');
      expect(integrations.updateCredential).toHaveBeenCalledWith('int_1', 'fresh-secret');
      expect(zohoAdapter.checkInventory).toHaveBeenNthCalledWith(
        2,
        'fresh-secret',
        [{ sku: 'SKU-1', quantity: 2 }],
        'org_1',
      );
      expect(result).toEqual({ inStock: true });
    });

    it('propagates a second failure after the refresh-and-retry without refreshing again', async () => {
      prisma.order.findFirst.mockResolvedValue(order);
      prisma.integration.findFirst.mockResolvedValue({ provider: 'ZOHO_INVENTORY' });
      integrations.getDecryptedCredential.mockResolvedValue({
        integrationId: 'int_1',
        secret: 'stale-secret',
        config: { organizationId: 'org_1' },
      });
      integrations.getAdapter.mockReturnValue(zohoAdapter);
      zohoAdapter.checkInventory.mockRejectedValue(new UnauthorizedException('still expired'));
      zohoAdapter.refreshToken.mockResolvedValue('fresh-secret');

      await expect(service.checkInventory('t_1', 'o_1')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(zohoAdapter.refreshToken).toHaveBeenCalledTimes(1);
      expect(zohoAdapter.checkInventory).toHaveBeenCalledTimes(2);
    });

    it('does not attempt a refresh on a non-401 failure', async () => {
      prisma.order.findFirst.mockResolvedValue(order);
      prisma.integration.findFirst.mockResolvedValue({ provider: 'ZOHO_INVENTORY' });
      integrations.getDecryptedCredential.mockResolvedValue({
        integrationId: 'int_1',
        secret: 'secret-1',
        config: { organizationId: 'org_1' },
      });
      integrations.getAdapter.mockReturnValue(zohoAdapter);
      const upstreamError = new Error('zoho unreachable');
      zohoAdapter.checkInventory.mockRejectedValue(upstreamError);

      await expect(service.checkInventory('t_1', 'o_1')).rejects.toBe(upstreamError);
      expect(zohoAdapter.refreshToken).not.toHaveBeenCalled();
    });

    it('propagates a CircuitOpenException without attempting a refresh', async () => {
      prisma.order.findFirst.mockResolvedValue(order);
      prisma.integration.findFirst.mockResolvedValue({ provider: 'ZOHO_INVENTORY' });
      integrations.getDecryptedCredential.mockResolvedValue({
        integrationId: 'int_1',
        secret: 'secret-1',
        config: { organizationId: 'org_1' },
      });
      integrations.getAdapter.mockReturnValue(zohoAdapter);
      const circuitOpen = new CircuitOpenException('zoho', 30000);
      circuitBreaker.fire.mockRejectedValue(circuitOpen);

      await expect(service.checkInventory('t_1', 'o_1')).rejects.toBe(circuitOpen);
      expect(zohoAdapter.refreshToken).not.toHaveBeenCalled();
    });
  });

  describe('createShipment', () => {
    it('maps rawPayload shipping address and the stored fromAddress into the EasyPost input shape', async () => {
      const fromAddress = { name: 'Acme Warehouse', street1: '1 Main St', city: 'Austin', state: 'TX', zip: '78701', country: 'US' };
      prisma.order.findFirst.mockResolvedValue({
        id: 'o_1',
        tenantId: 't_1',
        shopifyOrderId: '4001',
        rawPayload: {
          shipping_address: { name: 'Ada Lovelace', address1: '10 Downing St', city: 'London', zip: 'SW1A 2AA', country: 'GB' },
        },
      });
      prisma.integration.findFirst.mockResolvedValue({ provider: 'EASYPOST' });
      integrations.getDecryptedCredential.mockResolvedValue({
        integrationId: 'int_2',
        secret: 'ep-api-key',
        config: { fromAddress },
      });
      integrations.getAdapter.mockReturnValue(easyPostAdapter);
      easyPostAdapter.createShipment.mockResolvedValue({
        trackingNumber: 'TRACK1',
        carrier: 'USPS',
        shipmentId: '999',
      });

      const result = await service.createShipment('t_1', 'o_1');

      expect(easyPostAdapter.createShipment).toHaveBeenCalledWith(
        'ep-api-key',
        {
          shopifyOrderId: '4001',
          shippingAddress: expect.objectContaining({ name: 'Ada Lovelace', city: 'London', country: 'GB' }),
        },
        fromAddress,
      );
      expect(result).toEqual({ trackingNumber: 'TRACK1', carrier: 'USPS', shipmentId: '999' });
    });

    it('throws NotFoundException instead of shipping when the order has no complete shipping address', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 'o_1',
        tenantId: 't_1',
        shopifyOrderId: '4001',
        rawPayload: {
          shipping_address: { name: 'Ada Lovelace', city: 'London', country: 'GB' },
        },
      });
      prisma.integration.findFirst.mockResolvedValue({ provider: 'EASYPOST' });
      integrations.getDecryptedCredential.mockResolvedValue({
        integrationId: 'int_2',
        secret: 'ep-api-key',
        config: { fromAddress: LOCAL_TEST_FALLBACK_ADDRESS },
      });
      integrations.getAdapter.mockReturnValue(easyPostAdapter);

      await expect(service.createShipment('t_1', 'o_1')).rejects.toBeInstanceOf(NotFoundException);
      expect(easyPostAdapter.createShipment).not.toHaveBeenCalled();
    });
  });

  describe('updateShopifyOrder', () => {
    it('calls the Shopify adapter with the shop from config and the order tracking info', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 'o_1',
        tenantId: 't_1',
        shopifyOrderId: '4001',
        rawPayload: { line_items: [{ id: 111, sku: 'SKU-1', quantity: 2 }, { id: 222, sku: 'SKU-2', quantity: 1 }] },
      });
      integrations.getDecryptedCredential.mockResolvedValue({
        integrationId: 'int_3',
        secret: 'shop-token',
        config: { shop: 'acme.myshopify.com' },
      });
      integrations.getAdapter.mockReturnValue(shopifyAdapter);

      await service.updateShopifyOrder('t_1', 'o_1', 'TRACK1', 'UPS');

      expect(shopifyAdapter.updateOrder).toHaveBeenCalledWith('shop-token', 'acme.myshopify.com', '4001', {
        trackingNumber: 'TRACK1',
        carrier: 'UPS',
        lineItems: [{ id: 111, quantity: 2 }, { id: 222, quantity: 1 }],
      });
    });
  });

  describe('sendSlackMessage', () => {
    it('calls the Slack adapter with the decrypted webhook URL and message', async () => {
      prisma.integration.findFirst.mockResolvedValue({ provider: 'SLACK' });
      integrations.getDecryptedCredential.mockResolvedValue({
        integrationId: 'int_4',
        secret: 'https://hooks.slack.com/services/x',
        config: {},
      });
      integrations.getAdapter.mockReturnValue(slackAdapter);

      await service.sendSlackMessage('t_1', 'Order shipped');

      expect(slackAdapter.sendMessage).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/x',
        'Order shipped',
      );
    });

    it('propagates a failure — best-effort semantics are n8n\'s job, not this endpoint\'s', async () => {
      prisma.integration.findFirst.mockResolvedValue({ provider: 'SLACK' });
      integrations.getDecryptedCredential.mockResolvedValue({
        integrationId: 'int_4',
        secret: 'https://hooks.slack.com/services/x',
        config: {},
      });
      integrations.getAdapter.mockReturnValue(slackAdapter);
      const upstreamError = new Error('slack unreachable');
      slackAdapter.sendMessage.mockRejectedValue(upstreamError);

      await expect(service.sendSlackMessage('t_1', 'Order shipped')).rejects.toBe(upstreamError);
    });

    it('propagates a CircuitOpenException when the Slack breaker is open', async () => {
      prisma.integration.findFirst.mockResolvedValue({ provider: 'SLACK' });
      integrations.getDecryptedCredential.mockResolvedValue({
        integrationId: 'int_4',
        secret: 'https://hooks.slack.com/services/x',
        config: {},
      });
      integrations.getAdapter.mockReturnValue(slackAdapter);
      const circuitOpen = new CircuitOpenException('slack', 15000);
      circuitBreaker.fire.mockRejectedValue(circuitOpen);

      await expect(service.sendSlackMessage('t_1', 'Order shipped')).rejects.toBe(circuitOpen);
      expect(slackAdapter.sendMessage).not.toHaveBeenCalled();
    });
  });
});
