import nock from 'nock';

import { ConfigService } from '@nestjs/config';

import { BadGatewayException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

import { ZohoInventoryAdapter } from './zoho-inventory.adapter';

const CONFIGURED_VALUES: Record<string, string> = {
  ZOHO_CLIENT_ID: 'client_123',
  ZOHO_CLIENT_SECRET: 'secret_abc',
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

describe('ZohoInventoryAdapter', () => {
  let adapter: ZohoInventoryAdapter;
  const config = makeConfig();

  beforeEach(() => {
    adapter = new ZohoInventoryAdapter(config);
    nock.cleanAll();
  });

  afterAll(() => nock.restore());

  describe('when ZOHO_CLIENT_ID/SECRET are not configured', () => {
    // Regression test for the reported boot crash: "Configuration key
    // ZOHO_CLIENT_ID does not exist" thrown from the constructor via
    // getOrThrow, which took down the whole app at boot (Nest builds every
    // registered adapter eagerly) even for a tenant who never touches Zoho.
    it('constructs successfully instead of throwing, and reports isConfigured() === false', () => {
      expect(
        () =>
          new ZohoInventoryAdapter(
            makeConfig({ ZOHO_CLIENT_ID: undefined, ZOHO_CLIENT_SECRET: undefined }),
          ),
      ).not.toThrow();

      const unconfigured = new ZohoInventoryAdapter(
        makeConfig({ ZOHO_CLIENT_ID: undefined, ZOHO_CLIENT_SECRET: undefined }),
      );
      expect(unconfigured.isConfigured()).toBe(false);
    });

    it('buildAuthorizeUrl throws ServiceUnavailableException instead of building a broken URL', () => {
      const unconfigured = new ZohoInventoryAdapter(makeConfig({ ZOHO_CLIENT_ID: undefined }));
      expect(() => unconfigured.buildAuthorizeUrl({ state: 's' })).toThrow(ServiceUnavailableException);
    });
  });

  it('builds an authorize URL with the expected params (no shop equivalent)', () => {
    const url = adapter.buildAuthorizeUrl({ state: 'state123' });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://accounts.zoho.com/oauth/v2/auth');
    expect(parsed.searchParams.get('client_id')).toBe('client_123');
    expect(parsed.searchParams.get('state')).toBe('state123');
    expect(parsed.searchParams.get('access_type')).toBe('offline');
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'https://app.example.test/integrations/inventory/callback',
    );
  });

  it('exchanges a code for a JSON-stringified access+refresh token pair', async () => {
    nock('https://accounts.zoho.com')
      .post('/oauth/v2/token')
      .reply(200, { access_token: 'at_1', refresh_token: 'rt_1', expires_in: 3600 });

    const secret = await adapter.exchangeCodeForToken({ code: 'code_1' });
    const parsed = JSON.parse(secret);
    expect(parsed.accessToken).toBe('at_1');
    expect(parsed.refreshToken).toBe('rt_1');
    expect(typeof parsed.expiresAt).toBe('string');
  });

  it('throws BadGatewayException when token exchange fails', async () => {
    nock('https://accounts.zoho.com').post('/oauth/v2/token').reply(401);
    await expect(adapter.exchangeCodeForToken({ code: 'bad' })).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('refreshToken carries the original refresh token forward (Zoho does not return a new one)', async () => {
    const current = JSON.stringify({ accessToken: 'stale', refreshToken: 'rt_1', expiresAt: 'x' });
    nock('https://accounts.zoho.com')
      .post('/oauth/v2/token')
      .reply(200, { access_token: 'at_2', expires_in: 3600 });

    const refreshed = await adapter.refreshToken(current);
    const parsed = JSON.parse(refreshed);
    expect(parsed.accessToken).toBe('at_2');
    expect(parsed.refreshToken).toBe('rt_1');
  });

  it('fetchDefaultOrganizationId returns the first organization id', async () => {
    const secret = JSON.stringify({ accessToken: 'at_1', refreshToken: 'rt_1', expiresAt: 'x' });
    nock('https://www.zohoapis.com')
      .get('/inventory/v1/organizations')
      .reply(200, { organizations: [{ organization_id: 'org_1' }, { organization_id: 'org_2' }] });

    await expect(adapter.fetchDefaultOrganizationId(secret)).resolves.toBe('org_1');
  });

  it('fetchDefaultOrganizationId throws when the account has no organizations', async () => {
    const secret = JSON.stringify({ accessToken: 'at_1', refreshToken: 'rt_1', expiresAt: 'x' });
    nock('https://www.zohoapis.com').get('/inventory/v1/organizations').reply(200, { organizations: [] });

    await expect(adapter.fetchDefaultOrganizationId(secret)).rejects.toBeInstanceOf(BadGatewayException);
  });

  describe('checkInventory', () => {
    const secret = JSON.stringify({ accessToken: 'at_1', refreshToken: 'rt_1', expiresAt: 'x' });

    it('reports in stock when every SKU has sufficient available_stock', async () => {
      nock('https://www.zohoapis.com')
        .get('/inventory/v1/items')
        .query({ organization_id: 'org_1', sku: 'SKU-1' })
        .reply(200, { items: [{ available_stock: 10 }] });

      const result = await adapter.checkInventory(secret, [{ sku: 'SKU-1', quantity: 2 }], 'org_1');
      expect(result).toEqual({ inStock: true, availableQuantity: 10 });
    });

    it('reports out of stock when a SKU has insufficient available_stock', async () => {
      nock('https://www.zohoapis.com')
        .get('/inventory/v1/items')
        .query({ organization_id: 'org_1', sku: 'SKU-1' })
        .reply(200, { items: [{ available_stock: 1 }] });

      const result = await adapter.checkInventory(secret, [{ sku: 'SKU-1', quantity: 5 }], 'org_1');
      expect(result).toEqual({ inStock: false, availableQuantity: 1 });
    });

    it('skips items with no SKU and reports in stock if nothing is checkable', async () => {
      const result = await adapter.checkInventory(secret, [{ sku: '', quantity: 1 }], 'org_1');
      expect(result).toEqual({ inStock: true });
    });

    it('throws UnauthorizedException on a 401 — the signal IntegrationActionsService refreshes on', async () => {
      nock('https://www.zohoapis.com')
        .get('/inventory/v1/items')
        .query({ organization_id: 'org_1', sku: 'SKU-1' })
        .reply(401);

      await expect(
        adapter.checkInventory(secret, [{ sku: 'SKU-1', quantity: 1 }], 'org_1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws BadGatewayException on any other non-2xx response', async () => {
      nock('https://www.zohoapis.com')
        .get('/inventory/v1/items')
        .query({ organization_id: 'org_1', sku: 'SKU-1' })
        .reply(500);

      await expect(
        adapter.checkInventory(secret, [{ sku: 'SKU-1', quantity: 1 }], 'org_1'),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });
});
