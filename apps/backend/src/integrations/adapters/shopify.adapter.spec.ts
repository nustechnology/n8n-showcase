import nock from 'nock';

import { ConfigService } from '@nestjs/config';

import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';

import { ShopifyAdapter } from './shopify.adapter';

const CONFIGURED_VALUES: Record<string, string> = {
  SHOPIFY_CLIENT_ID: 'client_123',
  SHOPIFY_CLIENT_SECRET: 'secret_abc',
  SHOPIFY_SCOPES: 'read_orders',
  APP_BASE_URL: 'https://app.example.test',
};

function makeConfig(overrides: Record<string, string | undefined> = {}) {
  const values = { ...CONFIGURED_VALUES, ...overrides };
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Configuration key "${key}" does not exist`);
      return value;
    },
  } as unknown as ConfigService;
}

describe('ShopifyAdapter', () => {
  let adapter: ShopifyAdapter;
  const config = makeConfig();

  beforeEach(() => {
    adapter = new ShopifyAdapter(config);
    nock.cleanAll();
  });

  afterAll(() => nock.restore());

  describe('when SHOPIFY_CLIENT_ID/SECRET/SCOPES are not configured', () => {
    // Regression test for the boot crash this fixes: the adapter must
    // still construct (Nest builds it at boot regardless of which
    // providers are registered/used) and report itself unusable, rather
    // than throwing out of the constructor.
    it('constructs successfully and reports isConfigured() === false', () => {
      const unconfigured = new ShopifyAdapter(
        makeConfig({ SHOPIFY_CLIENT_ID: undefined, SHOPIFY_CLIENT_SECRET: undefined, SHOPIFY_SCOPES: undefined }),
      );
      expect(unconfigured.isConfigured()).toBe(false);
    });

    it('buildAuthorizeUrl throws ServiceUnavailableException instead of building a broken URL', () => {
      const unconfigured = new ShopifyAdapter(makeConfig({ SHOPIFY_CLIENT_ID: undefined }));
      expect(() => unconfigured.buildAuthorizeUrl({ shop: 'test-shop.myshopify.com', state: 's' })).toThrow(
        ServiceUnavailableException,
      );
    });
  });

  it('builds an authorize URL with the expected params', () => {
    const url = adapter.buildAuthorizeUrl({ shop: 'test-shop.myshopify.com', state: 'state123' });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      'https://test-shop.myshopify.com/admin/oauth/authorize',
    );
    expect(parsed.searchParams.get('client_id')).toBe('client_123');
    expect(parsed.searchParams.get('scope')).toBe('read_orders');
    expect(parsed.searchParams.get('state')).toBe('state123');
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'https://app.example.test/integrations/shopify/callback',
    );
  });

  it('exchanges a code for an access token', async () => {
    nock('https://test-shop.myshopify.com')
      .post('/admin/oauth/access_token', { client_id: 'client_123', client_secret: 'secret_abc', code: 'code_1' })
      .reply(200, { access_token: 'shpat_real_token' });

    const token = await adapter.exchangeCodeForToken({ shop: 'test-shop.myshopify.com', code: 'code_1' });
    expect(token).toBe('shpat_real_token');
  });

  it('throws BadGatewayException when token exchange fails', async () => {
    nock('https://test-shop.myshopify.com').post('/admin/oauth/access_token').reply(401);

    await expect(
      adapter.exchangeCodeForToken({ shop: 'test-shop.myshopify.com', code: 'bad' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('registers a webhook and returns its id', async () => {
    nock('https://test-shop.myshopify.com')
      .post('/admin/api/2026-07/webhooks.json', {
        webhook: { topic: 'orders/create', address: 'https://app.example.test/webhooks/shopify/int_1', format: 'json' },
      })
      .matchHeader('X-Shopify-Access-Token', 'shpat_real_token')
      .reply(201, { webhook: { id: 998877 } });

    const result = await adapter.registerWebhook(
      'shpat_real_token',
      'test-shop.myshopify.com',
      'https://app.example.test/webhooks/shopify/int_1',
    );
    expect(result).toEqual({ webhookId: '998877' });
  });

  it('throws BadGatewayException when webhook registration fails', async () => {
    nock('https://test-shop.myshopify.com').post('/admin/api/2026-07/webhooks.json').reply(422);

    await expect(
      adapter.registerWebhook('token', 'test-shop.myshopify.com', 'https://app.example.test/webhooks/shopify/int_1'),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('unregisters a webhook by id', async () => {
    nock('https://test-shop.myshopify.com')
      .delete('/admin/api/2026-07/webhooks/998877.json')
      .matchHeader('X-Shopify-Access-Token', 'shpat_real_token')
      .reply(200);

    await expect(
      adapter.unregisterWebhook('shpat_real_token', 'test-shop.myshopify.com', '998877'),
    ).resolves.toBeUndefined();
  });

  it('testConnection succeeds when the shop is reachable and the registered webhook still exists', async () => {
    nock('https://test-shop.myshopify.com')
      .get('/admin/api/2026-07/shop.json')
      .reply(200, { shop: {} })
      .get('/admin/api/2026-07/webhooks/998877.json')
      .reply(200, { webhook: { id: 998877 } });

    await expect(
      adapter.testConnection('shpat_real_token', { shop: 'test-shop.myshopify.com', shopifyWebhookId: '998877' }),
    ).resolves.toBeUndefined();
  });

  it('testConnection throws BadGatewayException on a non-2xx response from shop.json', async () => {
    nock('https://test-shop.myshopify.com').get('/admin/api/2026-07/shop.json').reply(401);

    await expect(
      adapter.testConnection('bad_token', { shop: 'test-shop.myshopify.com', shopifyWebhookId: '998877' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('testConnection throws when no webhook was ever registered (DEGRADED integration)', async () => {
    nock('https://test-shop.myshopify.com').get('/admin/api/2026-07/shop.json').reply(200, { shop: {} });

    await expect(
      adapter.testConnection('shpat_real_token', { shop: 'test-shop.myshopify.com' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('testConnection throws when the registered webhook no longer exists', async () => {
    nock('https://test-shop.myshopify.com')
      .get('/admin/api/2026-07/shop.json')
      .reply(200, { shop: {} })
      .get('/admin/api/2026-07/webhooks/998877.json')
      .reply(404);

    await expect(
      adapter.testConnection('shpat_real_token', { shop: 'test-shop.myshopify.com', shopifyWebhookId: '998877' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  describe('updateOrder', () => {
    const GRAPHQL_PATH = '/admin/api/2026-07/graphql.json';
    const trackingInfo = { trackingNumber: 'TRACK123', carrier: 'UPS', lineItems: [{ id: 555, quantity: 1 }] };

    const isFulfillmentOrdersQuery = (body: { query: string }) => body.query.includes('getFulfillmentOrders');
    const isFulfillmentCreateMutation = (body: { query: string }) => body.query.includes('mutation fulfillmentCreate');

    const FULFILLMENT_ORDERS_RESPONSE = {
      data: {
        order: {
          fulfillmentOrders: {
            edges: [
              {
                node: {
                  id: 'gid://shopify/FulfillmentOrder/1',
                  lineItems: {
                    edges: [{ node: { id: 'gid://shopify/FulfillmentOrderLineItem/10', remainingQuantity: 2 } }],
                  },
                },
              },
            ],
          },
        },
      },
    };

    it('fetches fulfillment orders, then creates a fulfillment from their remaining quantities, without notifying the customer', async () => {
      let mutationBody: { query: string; variables: Record<string, unknown> } | undefined;

      nock('https://test-shop.myshopify.com')
        .post(GRAPHQL_PATH, isFulfillmentOrdersQuery)
        .matchHeader('X-Shopify-Access-Token', 'shpat_real_token')
        .reply(200, FULFILLMENT_ORDERS_RESPONSE);

      nock('https://test-shop.myshopify.com')
        .post(GRAPHQL_PATH, isFulfillmentCreateMutation)
        .matchHeader('X-Shopify-Access-Token', 'shpat_real_token')
        .reply(200, (_uri, body) => {
          mutationBody = body as typeof mutationBody;
          return { data: { fulfillmentCreate: { fulfillment: { id: 'gid://shopify/Fulfillment/1' }, userErrors: [] } } };
        });

      await expect(
        adapter.updateOrder('shpat_real_token', 'test-shop.myshopify.com', '4001', trackingInfo),
      ).resolves.toBeUndefined();

      // Fulfillment quantities come from the live fulfillmentOrders query
      // (remainingQuantity), not from trackingInfo.lineItems — Shopify's
      // fulfillmentCreate mutation requires fulfillment-order-scoped line
      // item ids, which only that query can resolve.
      expect(mutationBody?.variables.fulfillment).toEqual({
        lineItemsByFulfillmentOrder: [
          {
            fulfillmentOrderId: 'gid://shopify/FulfillmentOrder/1',
            fulfillmentOrderLineItems: [{ id: 'gid://shopify/FulfillmentOrderLineItem/10', quantity: 2 }],
          },
        ],
        trackingInfo: { number: 'TRACK123', company: 'UPS' },
        notifyCustomer: false,
      });
    });

    it('throws BadGatewayException when the order has no fulfillment orders', async () => {
      nock('https://test-shop.myshopify.com')
        .post(GRAPHQL_PATH, isFulfillmentOrdersQuery)
        .reply(200, { data: { order: { fulfillmentOrders: { edges: [] } } } });

      await expect(
        adapter.updateOrder('shpat_real_token', 'test-shop.myshopify.com', '4001', trackingInfo),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('throws BadGatewayException when the fulfillment orders query fails', async () => {
      nock('https://test-shop.myshopify.com').post(GRAPHQL_PATH, isFulfillmentOrdersQuery).reply(500);

      await expect(
        adapter.updateOrder('shpat_real_token', 'test-shop.myshopify.com', '4001', trackingInfo),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('throws BadGatewayException when fulfillmentCreate returns userErrors', async () => {
      nock('https://test-shop.myshopify.com')
        .post(GRAPHQL_PATH, isFulfillmentOrdersQuery)
        .reply(200, FULFILLMENT_ORDERS_RESPONSE);

      nock('https://test-shop.myshopify.com')
        .post(GRAPHQL_PATH, isFulfillmentCreateMutation)
        .reply(200, {
          data: {
            fulfillmentCreate: {
              fulfillment: null,
              userErrors: [{ field: 'trackingInfo', message: 'is invalid' }],
            },
          },
        });

      await expect(
        adapter.updateOrder('shpat_real_token', 'test-shop.myshopify.com', '4001', trackingInfo),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('throws BadGatewayException when the fulfillmentCreate request fails', async () => {
      nock('https://test-shop.myshopify.com')
        .post(GRAPHQL_PATH, isFulfillmentOrdersQuery)
        .reply(200, FULFILLMENT_ORDERS_RESPONSE);

      nock('https://test-shop.myshopify.com').post(GRAPHQL_PATH, isFulfillmentCreateMutation).reply(422);

      await expect(
        adapter.updateOrder('shpat_real_token', 'test-shop.myshopify.com', '4001', trackingInfo),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });
});
