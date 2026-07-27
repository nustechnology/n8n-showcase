import nock from 'nock';

import { BadGatewayException, UnauthorizedException } from '@nestjs/common';

import { EasyPostAdapter } from './easypost.adapter';

describe('EasyPostAdapter', () => {
  let adapter: EasyPostAdapter;
  const apiKey = 'ep_test_key_1';
  const expectedAuthHeader = `Basic ${Buffer.from('ep_test_key_1:').toString('base64')}`;
  const fromAddress = { name: 'Acme Warehouse', street1: '1 Main St', city: 'Austin', state: 'TX', zip: '78701', country: 'US' };

  beforeEach(() => {
    adapter = new EasyPostAdapter();
    nock.cleanAll();
  });

  afterAll(() => nock.restore());

  it('testConnection succeeds against a valid API key', async () => {
    nock('https://api.easypost.com')
      .get('/v2/api_keys')
      .matchHeader('Authorization', expectedAuthHeader)
      .reply(200, {});

    await expect(adapter.testConnection(apiKey)).resolves.toBeUndefined();
  });

  it('testConnection throws UnauthorizedException on a 401', async () => {
    nock('https://api.easypost.com').get('/v2/api_keys').reply(401);
    await expect(adapter.testConnection(apiKey)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('testConnection throws BadGatewayException on any other failure', async () => {
    nock('https://api.easypost.com').get('/v2/api_keys').reply(500);
    await expect(adapter.testConnection(apiKey)).rejects.toBeInstanceOf(BadGatewayException);
  });

  describe('createShipment', () => {
    it('creates the shipment, buys the cheapest rate, and returns tracking info', async () => {
      nock('https://api.easypost.com')
        .post('/v2/shipments')
        .matchHeader('Authorization', expectedAuthHeader)
        .reply(200, {
          id: 'shp_1',
          rates: [
            { id: 'rate_expensive', carrier: 'UPS', service: 'Ground', rate: '12.50' },
            { id: 'rate_cheap', carrier: 'USPS', service: 'Priority', rate: '6.20' },
          ],
        });
      nock('https://api.easypost.com')
        .post('/v2/shipments/shp_1/buy', { rate: { id: 'rate_cheap' } })
        .reply(200, {
          id: 'shp_1',
          tracking_code: 'TRACK123',
          selected_rate: { carrier: 'USPS' },
        });

      const result = await adapter.createShipment(
        apiKey,
        {
          shopifyOrderId: '4001',
          shippingAddress: { name: 'Ada Lovelace', city: 'London', country: 'GB' },
        },
        fromAddress,
      );

      expect(result).toEqual({ trackingNumber: 'TRACK123', carrier: 'USPS', shipmentId: 'shp_1' });
    });

    it('ignores a malformed rate string in first position and still buys the actual cheapest valid rate', async () => {
      nock('https://api.easypost.com')
        .post('/v2/shipments')
        .reply(200, {
          id: 'shp_1',
          rates: [
            { id: 'rate_malformed', carrier: 'DHL', service: 'Express', rate: 'N/A' },
            { id: 'rate_expensive', carrier: 'UPS', service: 'Ground', rate: '12.50' },
            { id: 'rate_cheap', carrier: 'USPS', service: 'Priority', rate: '6.20' },
          ],
        });
      nock('https://api.easypost.com')
        .post('/v2/shipments/shp_1/buy', { rate: { id: 'rate_cheap' } })
        .reply(200, { id: 'shp_1', tracking_code: 'TRACK123', selected_rate: { carrier: 'USPS' } });

      const result = await adapter.createShipment(
        apiKey,
        { shopifyOrderId: '4001', shippingAddress: {} },
        fromAddress,
      );

      expect(result.carrier).toBe('USPS');
    });

    it('throws BadGatewayException when shipment creation fails', async () => {
      nock('https://api.easypost.com').post('/v2/shipments').reply(422);

      await expect(
        adapter.createShipment(
          apiKey,
          { shopifyOrderId: '4001', shippingAddress: {} },
          fromAddress,
        ),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('throws BadGatewayException when no rates are returned', async () => {
      nock('https://api.easypost.com').post('/v2/shipments').reply(200, { id: 'shp_1', rates: [] });

      await expect(
        adapter.createShipment(
          apiKey,
          { shopifyOrderId: '4001', shippingAddress: {} },
          fromAddress,
        ),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('throws BadGatewayException when buying the label fails', async () => {
      nock('https://api.easypost.com')
        .post('/v2/shipments')
        .reply(200, { id: 'shp_1', rates: [{ id: 'rate_1', carrier: 'USPS', service: 'Priority', rate: '6.20' }] });
      nock('https://api.easypost.com').post('/v2/shipments/shp_1/buy').reply(500);

      await expect(
        adapter.createShipment(
          apiKey,
          { shopifyOrderId: '4001', shippingAddress: {} },
          fromAddress,
        ),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });
});
