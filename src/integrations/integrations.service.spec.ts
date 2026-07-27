import { createHmac } from 'crypto';

import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { IntegrationProvider, IntegrationStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';
import { CircuitOpenException } from '../common/circuit-breaker/circuit-open.exception';

import { CredentialsService } from '../credentials/credentials.service';

import { NotificationsService } from '../notifications/notifications.service';

import { IntegrationAdapterRegistry } from './integration-adapter.registry';
import { IntegrationsService } from './integrations.service';

const CLIENT_SECRET = 'test-shopify-secret';
const FRONTEND_URL = 'https://app.example.test';

function signQuery(params: Record<string, string>): string {
  const message = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHmac('sha256', CLIENT_SECRET).update(message).digest('hex');
}

describe('IntegrationsService', () => {
  let service: IntegrationsService;
  let prisma: {
    integration: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    integrationCredential: { upsert: jest.Mock; update: jest.Mock };
    tenant: { findUnique: jest.Mock };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let credentials: { encrypt: jest.Mock; decrypt: jest.Mock; buildDisplayHint: jest.Mock };
  let shopifyAdapter: {
    authType: 'oauth';
    isConfigured: jest.Mock;
    buildAuthorizeUrl: jest.Mock;
    exchangeCodeForToken: jest.Mock;
    registerWebhook: jest.Mock;
    unregisterWebhook: jest.Mock;
    testConnection: jest.Mock;
  };
  let resendAdapter: {
    authType: 'api_key';
    validateKey: jest.Mock;
    testConnection: jest.Mock;
  };
  let zohoAdapter: {
    authType: 'oauth';
    isConfigured: jest.Mock;
    buildAuthorizeUrl: jest.Mock;
    exchangeCodeForToken: jest.Mock;
    fetchDefaultOrganizationId: jest.Mock;
    testConnection: jest.Mock;
  };
  let easyPostAdapter: { authType: 'api_key'; validateKey: jest.Mock; testConnection: jest.Mock };
  let slackAdapter: { authType: 'api_key'; validateKey: jest.Mock; testConnection: jest.Mock };
  let registry: { get: jest.Mock };
  let notifications: { notifyTenant: jest.Mock };
  let circuitBreaker: { fire: jest.Mock };

  beforeEach(async () => {
    prisma = {
      integration: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      integrationCredential: { upsert: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}) },
      tenant: { findUnique: jest.fn().mockResolvedValue({ slug: 'acme' }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    credentials = {
      encrypt: jest.fn().mockReturnValue({ ciphertext: 'c', iv: 'i', authTag: 'a', keyVersion: 1 }),
      decrypt: jest.fn().mockReturnValue('decrypted-secret'),
      buildDisplayHint: jest.fn().mockReturnValue('••••1234'),
    };
    shopifyAdapter = {
      authType: 'oauth',
      isConfigured: jest.fn().mockReturnValue(true),
      buildAuthorizeUrl: jest.fn().mockReturnValue('https://shop.myshopify.com/authorize'),
      exchangeCodeForToken: jest.fn().mockResolvedValue('shpat_token'),
      registerWebhook: jest.fn().mockResolvedValue({ webhookId: 'wh_1' }),
      unregisterWebhook: jest.fn().mockResolvedValue(undefined),
      testConnection: jest.fn().mockResolvedValue(undefined),
    };
    resendAdapter = {
      authType: 'api_key',
      validateKey: jest.fn().mockResolvedValue(undefined),
      testConnection: jest.fn().mockResolvedValue(undefined),
    };
    zohoAdapter = {
      authType: 'oauth',
      isConfigured: jest.fn().mockReturnValue(true),
      buildAuthorizeUrl: jest.fn().mockReturnValue('https://accounts.zoho.com/oauth/v2/auth?state=x'),
      exchangeCodeForToken: jest.fn().mockResolvedValue(JSON.stringify({ accessToken: 'at_1', refreshToken: 'rt_1', expiresAt: 'x' })),
      fetchDefaultOrganizationId: jest.fn().mockResolvedValue('org_1'),
      testConnection: jest.fn().mockResolvedValue(undefined),
    };
    easyPostAdapter = {
      authType: 'api_key',
      validateKey: jest.fn().mockResolvedValue(undefined),
      testConnection: jest.fn().mockResolvedValue(undefined),
    };
    slackAdapter = {
      authType: 'api_key',
      validateKey: jest.fn().mockResolvedValue(undefined),
      testConnection: jest.fn().mockResolvedValue(undefined),
    };
    registry = {
      get: jest.fn((provider: IntegrationProvider) => {
        if (provider === IntegrationProvider.SHOPIFY) return shopifyAdapter;
        if (provider === IntegrationProvider.ZOHO_INVENTORY) return zohoAdapter;
        if (provider === IntegrationProvider.EASYPOST) return easyPostAdapter;
        if (provider === IntegrationProvider.SLACK) return slackAdapter;
        return resendAdapter;
      }),
    };
    notifications = { notifyTenant: jest.fn() };
    circuitBreaker = { fire: jest.fn((_provider: IntegrationProvider, action: () => Promise<unknown>) => action()) };

    const configValues: Record<string, string> = {
      FRONTEND_URL,
      SHOPIFY_CLIENT_SECRET: CLIENT_SECRET,
      APP_BASE_URL: 'https://api.example.test',
    };
    const config = {
      get: (key: string) => configValues[key],
      getOrThrow: (key: string) => {
        const value = configValues[key];
        if (value === undefined) throw new Error(`Configuration key "${key}" does not exist`);
        return value;
      },
    } as unknown as ConfigService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        IntegrationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: CredentialsService, useValue: credentials },
        { provide: IntegrationAdapterRegistry, useValue: registry },
        { provide: NotificationsService, useValue: notifications },
        { provide: CircuitBreakerService, useValue: circuitBreaker },
      ],
    }).compile();

    service = moduleRef.get(IntegrationsService);
  });

  describe('listForTenant', () => {
    it('excludes OPENAI from the catalog', async () => {
      const result = await service.listForTenant('t_1');
      expect(result.find((r) => r.provider === IntegrationProvider.OPENAI)).toBeUndefined();
    });

    it('marks all registered providers (including mailers) as supported, excluding only OpenAI', async () => {
      const result = await service.listForTenant('t_1');
      const byProvider = Object.fromEntries(result.map((r) => [r.provider, r.supported]));
      expect(byProvider[IntegrationProvider.SHOPIFY]).toBe(true);
      expect(byProvider[IntegrationProvider.RESEND]).toBe(true);
      expect(byProvider[IntegrationProvider.SENDGRID]).toBe(true);
      expect(byProvider[IntegrationProvider.MAILGUN]).toBe(true);
      expect(byProvider[IntegrationProvider.ZOHO_INVENTORY]).toBe(true);
      expect(byProvider[IntegrationProvider.EASYPOST]).toBe(true);
      expect(byProvider[IntegrationProvider.SLACK]).toBe(true);
    });

    it('defaults status to DISCONNECTED when no row exists', async () => {
      const result = await service.listForTenant('t_1');
      expect(result.every((r) => r.status === IntegrationStatus.DISCONNECTED)).toBe(true);
    });

    // Regression test for the Zoho boot-crash fix: a registered OAuth
    // adapter whose platform-level app credentials aren't configured yet
    // must report supported: false, not crash the whole catalog lookup.
    it('marks an OAuth provider unsupported when its platform credentials are not configured', async () => {
      zohoAdapter.isConfigured.mockReturnValue(false);

      const result = await service.listForTenant('t_1');
      const byProvider = Object.fromEntries(result.map((r) => [r.provider, r.supported]));
      expect(byProvider[IntegrationProvider.ZOHO_INVENTORY]).toBe(false);
      expect(byProvider[IntegrationProvider.SHOPIFY]).toBe(true);
    });

    it('reflects the tenant row status where one exists', async () => {
      prisma.integration.findMany.mockResolvedValue([
        {
          provider: IntegrationProvider.SHOPIFY,
          status: IntegrationStatus.ACTIVE,
          config: { shop: 'acme.myshopify.com' },
          lastCheckedAt: null,
          lastErrorMessage: null,
          credential: { displayHint: '••••abcd' },
        },
      ]);
      const result = await service.listForTenant('t_1');
      const shopify = result.find((r) => r.provider === IntegrationProvider.SHOPIFY);
      expect(shopify?.status).toBe(IntegrationStatus.ACTIVE);
      expect(shopify?.displayHint).toBe('••••abcd');
    });
  });

  describe('initConnect — Shopify (OAuth)', () => {
    it('upserts a CONNECTING integration and returns an authorize URL', async () => {
      prisma.integration.upsert.mockResolvedValue({ id: 'int_1' });

      const result = await service.initConnect('t_1', 'user_1', 'shopify', { shop: 'acme.myshopify.com' });

      expect(result).toEqual({ authorizeUrl: 'https://shop.myshopify.com/authorize' });
      expect(prisma.integration.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_provider: { tenantId: 't_1', provider: IntegrationProvider.SHOPIFY } },
          create: expect.objectContaining({ status: IntegrationStatus.CONNECTING }),
        }),
      );
      expect(shopifyAdapter.buildAuthorizeUrl).toHaveBeenCalledWith(
        expect.objectContaining({ shop: 'acme.myshopify.com' }),
      );
    });

    it('rejects an invalid shop domain', async () => {
      await expect(service.initConnect('t_1', 'user_1', 'shopify', { shop: 'not-a-shop' })).rejects.toThrow();
    });

    it('404s the same way an unregistered provider would when Shopify is not configured', async () => {
      shopifyAdapter.isConfigured.mockReturnValue(false);
      await expect(
        service.initConnect('t_1', 'user_1', 'shopify', { shop: 'acme.myshopify.com' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('initConnect — Resend (API key)', () => {
    it('validates the key, encrypts, and marks ACTIVE immediately', async () => {
      prisma.integration.upsert.mockResolvedValue({ id: 'int_2' });

      const result = await service.initConnect('t_1', 'user_1', 'resend', { apiKey: 're_abc' });

      expect(resendAdapter.validateKey).toHaveBeenCalledWith('re_abc');
      expect(credentials.encrypt).toHaveBeenCalledWith('re_abc', 'int_2');
      expect(prisma.integrationCredential.upsert).toHaveBeenCalled();
      expect(result).toEqual({ status: IntegrationStatus.ACTIVE });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 't_1',
          userId: 'user_1',
          action: 'integration.connected',
          resourceType: 'Integration',
          resourceId: 'int_2',
          metadata: { provider: IntegrationProvider.RESEND },
        }),
      });
    });
  });

  describe('initConnect — Zoho Inventory (OAuth)', () => {
    it('upserts a CONNECTING integration with empty config and returns an authorize URL', async () => {
      prisma.integration.upsert.mockResolvedValue({ id: 'int_3' });

      const result = await service.initConnect('t_1', 'user_1', 'zoho_inventory', {});

      expect(result).toEqual({ authorizeUrl: 'https://accounts.zoho.com/oauth/v2/auth?state=x' });
      expect(prisma.integration.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ status: IntegrationStatus.CONNECTING, config: {} }),
        }),
      );
      expect(zohoAdapter.buildAuthorizeUrl).toHaveBeenCalledWith(
        expect.not.objectContaining({ shop: expect.anything() }),
      );
    });
  });

  describe('initConnect — EasyPost (API key + non-secret fromAddress)', () => {
    const fromAddress = {
      name: 'Acme Warehouse',
      street1: '1 Main St',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      country: 'US',
    };

    it('stores the bare apiKey as the credential and fromAddress in Integration.config', async () => {
      prisma.integration.upsert.mockResolvedValue({ id: 'int_4' });

      const result = await service.initConnect('t_1', 'user_1', 'easypost', { apiKey: 'key_1', fromAddress });

      expect(easyPostAdapter.validateKey).toHaveBeenCalledWith('key_1');
      expect(credentials.encrypt).toHaveBeenCalledWith('key_1', 'int_4');
      expect(credentials.buildDisplayHint).toHaveBeenCalledWith('key_1');
      expect(prisma.integration.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ config: { fromAddress } }),
          update: expect.objectContaining({ config: { fromAddress } }),
        }),
      );
      expect(result).toEqual({ status: IntegrationStatus.ACTIVE });
    });
  });

  describe('initConnect — Slack (webhook URL)', () => {
    it('stores the bare webhook URL as the credential', async () => {
      prisma.integration.upsert.mockResolvedValue({ id: 'int_5' });
      const webhookUrl = 'https://hooks.slack.com/services/T00/B00/xxxx';

      const result = await service.initConnect('t_1', 'user_1', 'slack', { webhookUrl });

      expect(slackAdapter.validateKey).toHaveBeenCalledWith(webhookUrl);
      expect(credentials.encrypt).toHaveBeenCalledWith(webhookUrl, 'int_5');
      expect(result).toEqual({ status: IntegrationStatus.ACTIVE });
    });
  });

  it('rejects connect for a provider with no adapter registered', async () => {
    registry.get.mockImplementation(() => {
      throw new NotFoundException('not supported');
    });
    await expect(service.initConnect('t_1', 'user_1', 'slack', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('handleCallback', () => {
    const baseParams = { shop: 'acme.myshopify.com', code: 'code_1', state: 'state_1' };

    it('redirects to error when the HMAC is invalid', async () => {
      const result = await service.handleCallback('shopify', { ...baseParams, hmac: 'garbage' });
      expect(result.redirectUrl).toContain('status=error');
      expect(prisma.integration.findUnique).not.toHaveBeenCalled();
    });

    it('redirects to error when required query params are missing', async () => {
      const hmac = signQuery({ shop: baseParams.shop });
      const result = await service.handleCallback('shopify', { shop: baseParams.shop, hmac });
      expect(result.redirectUrl).toContain('status=error');
    });

    it('redirects to error when the state is unknown or expired', async () => {
      const hmac = signQuery(baseParams);
      prisma.integration.findUnique.mockResolvedValue(null);

      const result = await service.handleCallback('shopify', { ...baseParams, hmac });
      expect(result.redirectUrl).toContain('status=error');
    });

    it('deletes the stranded CONNECTING row when the OAuth consent is declined (no code)', async () => {
      const params = { shop: baseParams.shop, state: baseParams.state };
      const hmac = signQuery(params);
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        tenantId: 't_1',
        status: IntegrationStatus.CONNECTING,
        credential: null,
      });

      const result = await service.handleCallback('shopify', { ...params, hmac });

      expect(result.redirectUrl).toContain('status=error');
      expect(prisma.integration.delete).toHaveBeenCalledWith({ where: { id: 'int_1' } });
      expect(notifications.notifyTenant).not.toHaveBeenCalled();
    });

    it('deletes the stranded CONNECTING row when the state has expired', async () => {
      const hmac = signQuery(baseParams);
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        tenantId: 't_1',
        status: IntegrationStatus.CONNECTING,
        oauthStateExpiresAt: new Date(Date.now() - 60_000),
        credential: null,
      });

      const result = await service.handleCallback('shopify', { ...baseParams, hmac });

      expect(result.redirectUrl).toContain('status=error');
      expect(prisma.integration.delete).toHaveBeenCalledWith({ where: { id: 'int_1' } });
      expect(notifications.notifyTenant).not.toHaveBeenCalled();
    });

    it('leaves the row alone if a credential already exists (initConnect re-run over an active integration)', async () => {
      const params = { shop: baseParams.shop, state: baseParams.state };
      const hmac = signQuery(params);
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        tenantId: 't_1',
        status: IntegrationStatus.CONNECTING,
        credential: { ciphertext: 'c', iv: 'i', authTag: 'a' },
      });

      await service.handleCallback('shopify', { ...params, hmac });

      expect(prisma.integration.delete).not.toHaveBeenCalled();
    });

    it('fails the integration when the callback shop does not match the connect-time shop', async () => {
      const hmac = signQuery(baseParams);
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        tenantId: 't_1',
        oauthStateExpiresAt: new Date(Date.now() + 60_000),
        config: { shop: 'different-shop.myshopify.com' },
      });

      const result = await service.handleCallback('shopify', { ...baseParams, hmac });

      expect(result.redirectUrl).toContain('status=error');
      expect(prisma.integration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: IntegrationStatus.ERROR }),
        }),
      );
      expect(notifications.notifyTenant).toHaveBeenCalledWith(
        't_1',
        expect.objectContaining({ type: 'integration_error' }),
      );
    });

    it('fails the integration when another tenant already has this shop ACTIVE', async () => {
      const hmac = signQuery(baseParams);
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        tenantId: 't_1',
        oauthStateExpiresAt: new Date(Date.now() + 60_000),
        config: { shop: baseParams.shop },
      });
      prisma.integration.findFirst.mockResolvedValue({ id: 'int_other_tenant' });

      const result = await service.handleCallback('shopify', { ...baseParams, hmac });

      expect(result.redirectUrl).toContain('status=error');
      expect(prisma.integration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: IntegrationStatus.ERROR,
            lastErrorMessage: expect.stringContaining('already connected'),
          }),
        }),
      );
      expect(shopifyAdapter.exchangeCodeForToken).not.toHaveBeenCalled();
    });

    it('fails the integration when token exchange throws', async () => {
      const hmac = signQuery(baseParams);
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        tenantId: 't_1',
        oauthStateExpiresAt: new Date(Date.now() + 60_000),
        config: { shop: baseParams.shop },
      });
      shopifyAdapter.exchangeCodeForToken.mockRejectedValue(new Error('shopify down'));

      const result = await service.handleCallback('shopify', { ...baseParams, hmac });

      expect(result.redirectUrl).toContain('status=error');
      expect(prisma.integration.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: IntegrationStatus.ERROR }) }),
      );
      expect(credentials.encrypt).not.toHaveBeenCalled();
    });

    it('marks DEGRADED (not ERROR) when webhook registration fails after a successful exchange', async () => {
      const hmac = signQuery(baseParams);
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        tenantId: 't_1',
        oauthStateExpiresAt: new Date(Date.now() + 60_000),
        config: { shop: baseParams.shop },
      });
      shopifyAdapter.registerWebhook.mockRejectedValue(new Error('registration failed'));

      const result = await service.handleCallback('shopify', { ...baseParams, hmac });

      // Credential was stored — the connection itself succeeded.
      expect(credentials.encrypt).toHaveBeenCalled();
      expect(prisma.integration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: IntegrationStatus.DEGRADED }),
        }),
      );
      // Still redirected as success — DEGRADED is surfaced via GET /integrations, not a hard error redirect.
      expect(result.redirectUrl).toContain('status=success');
      expect(notifications.notifyTenant).toHaveBeenCalledWith(
        't_1',
        expect.objectContaining({ type: 'integration_degraded' }),
      );
    });

    it('succeeds end to end: stores the credential, registers the webhook, clears oauthState', async () => {
      const hmac = signQuery(baseParams);
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        tenantId: 't_1',
        oauthStateExpiresAt: new Date(Date.now() + 60_000),
        config: { shop: baseParams.shop },
      });

      const result = await service.handleCallback('shopify', { ...baseParams, hmac });

      expect(result.redirectUrl).toBe(`${FRONTEND_URL}/acme/integrations/shopify?status=success`);
      expect(credentials.encrypt).toHaveBeenCalledWith('shpat_token', 'int_1');
      expect(shopifyAdapter.registerWebhook).toHaveBeenCalledWith(
        'shpat_token',
        baseParams.shop,
        'https://api.example.test/webhooks/shopify/int_1',
      );
      expect(prisma.integration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: IntegrationStatus.ACTIVE,
            oauthState: null,
            oauthStateExpiresAt: null,
          }),
        }),
      );
      // No Clerk session on this callback — userId is null, unlike the
      // API-key connect path's real actor.
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 't_1',
          userId: null,
          action: 'integration.connected',
          resourceType: 'Integration',
          resourceId: 'int_1',
          metadata: { provider: IntegrationProvider.SHOPIFY },
        }),
      });
    });
  });

  describe('handleCallback — Zoho Inventory', () => {
    it('redirects to error when state or code is missing', async () => {
      const result = await service.handleCallback('zoho_inventory', { state: 'state_1' });
      expect(result.redirectUrl).toContain('status=error');
    });

    it('redirects to error when the state is unknown or expired', async () => {
      prisma.integration.findUnique.mockResolvedValue(null);
      const result = await service.handleCallback('zoho_inventory', { state: 'state_1', code: 'code_1' });
      expect(result.redirectUrl).toContain('status=error');
    });

    it('deletes the stranded CONNECTING row when the user declines consent (no code)', async () => {
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        tenantId: 't_1',
        status: IntegrationStatus.CONNECTING,
        credential: null,
      });

      const result = await service.handleCallback('zoho_inventory', { state: 'state_1' });

      expect(result.redirectUrl).toContain('status=error');
      expect(prisma.integration.delete).toHaveBeenCalledWith({ where: { id: 'int_1' } });
      expect(notifications.notifyTenant).not.toHaveBeenCalled();
    });

    it('deletes the stranded CONNECTING row when the state has expired', async () => {
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        tenantId: 't_1',
        status: IntegrationStatus.CONNECTING,
        oauthStateExpiresAt: new Date(Date.now() - 60_000),
        credential: null,
      });

      const result = await service.handleCallback('zoho_inventory', { state: 'state_1', code: 'code_1' });

      expect(result.redirectUrl).toContain('status=error');
      expect(prisma.integration.delete).toHaveBeenCalledWith({ where: { id: 'int_1' } });
      expect(notifications.notifyTenant).not.toHaveBeenCalled();
    });

    it('leaves the row alone if a credential already exists (initConnect re-run over an active integration)', async () => {
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        tenantId: 't_1',
        status: IntegrationStatus.CONNECTING,
        credential: { ciphertext: 'c', iv: 'i', authTag: 'a' },
      });

      await service.handleCallback('zoho_inventory', { state: 'state_1' });

      expect(prisma.integration.delete).not.toHaveBeenCalled();
    });

    it('fails the integration (as ZOHO_INVENTORY, not SHOPIFY) when token exchange throws', async () => {
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        tenantId: 't_1',
        status: IntegrationStatus.CONNECTING,
        oauthStateExpiresAt: new Date(Date.now() + 60_000),
      });
      zohoAdapter.exchangeCodeForToken.mockRejectedValue(new Error('zoho down'));

      const result = await service.handleCallback('zoho_inventory', { state: 'state_1', code: 'code_1' });

      expect(result.redirectUrl).toContain('status=error');
      expect(prisma.integration.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: IntegrationStatus.ERROR }) }),
      );
      expect(notifications.notifyTenant).toHaveBeenCalledWith(
        't_1',
        expect.objectContaining({ type: 'integration_error' }),
      );
    });

    it('fails the integration when the organization id cannot be resolved', async () => {
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        tenantId: 't_1',
        status: IntegrationStatus.CONNECTING,
        oauthStateExpiresAt: new Date(Date.now() + 60_000),
      });
      zohoAdapter.fetchDefaultOrganizationId.mockRejectedValue(new Error('no orgs'));

      const result = await service.handleCallback('zoho_inventory', { state: 'state_1', code: 'code_1' });

      expect(result.redirectUrl).toContain('status=error');
      expect(credentials.encrypt).not.toHaveBeenCalled();
    });

    it('succeeds end to end: stores the credential and the resolved organizationId, marks ACTIVE', async () => {
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        tenantId: 't_1',
        status: IntegrationStatus.CONNECTING,
        oauthStateExpiresAt: new Date(Date.now() + 60_000),
      });

      const result = await service.handleCallback('zoho_inventory', { state: 'state_1', code: 'code_1' });

      expect(result.redirectUrl).toBe(`${FRONTEND_URL}/acme/integrations/zoho_inventory?status=success`);
      expect(zohoAdapter.fetchDefaultOrganizationId).toHaveBeenCalled();
      expect(prisma.integration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: IntegrationStatus.ACTIVE, config: { organizationId: 'org_1' } }),
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 't_1',
          userId: null,
          action: 'integration.connected',
          resourceType: 'Integration',
          resourceId: 'int_1',
          metadata: { provider: IntegrationProvider.ZOHO_INVENTORY },
        }),
      });
    });
  });

  describe('test', () => {
    it('throws NotFoundException when there is no connected integration', async () => {
      prisma.integration.findUnique.mockResolvedValue(null);
      await expect(service.test('t_1', 'shopify')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('decrypts and calls the adapter, updates lastCheckedAt on success', async () => {
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        config: { shop: 'acme.myshopify.com' },
        credential: { ciphertext: 'c', iv: 'i', authTag: 'a' },
      });

      await service.test('t_1', 'shopify');

      expect(credentials.decrypt).toHaveBeenCalledWith(expect.anything(), 'int_1');
      expect(shopifyAdapter.testConnection).toHaveBeenCalledWith('decrypted-secret', { shop: 'acme.myshopify.com' });
      expect(prisma.integration.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ lastErrorMessage: null }) }),
      );
    });

    it('clears a DEGRADED status back to ACTIVE once the adapter confirms health', async () => {
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        status: IntegrationStatus.DEGRADED,
        config: { shop: 'acme.myshopify.com', shopifyWebhookId: '998877' },
        credential: { ciphertext: 'c', iv: 'i', authTag: 'a' },
      });

      await service.test('t_1', 'shopify');

      expect(prisma.integration.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: IntegrationStatus.ACTIVE, lastErrorMessage: null }) }),
      );
    });

    it('marks DEGRADED and rethrows BadGatewayException on failure', async () => {
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        config: {},
        credential: { ciphertext: 'c', iv: 'i', authTag: 'a' },
      });
      shopifyAdapter.testConnection.mockRejectedValue(new Error('unreachable'));

      await expect(service.test('t_1', 'shopify')).rejects.toBeInstanceOf(BadGatewayException);
      expect(prisma.integration.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: IntegrationStatus.DEGRADED }) }),
      );
      expect(notifications.notifyTenant).toHaveBeenCalledWith(
        't_1',
        expect.objectContaining({ type: 'integration_degraded' }),
      );
    });

    it('propagates CircuitOpenException as-is, without touching status or notifying', async () => {
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        status: IntegrationStatus.ACTIVE,
        config: {},
        credential: { ciphertext: 'c', iv: 'i', authTag: 'a' },
      });
      circuitBreaker.fire.mockRejectedValue(new CircuitOpenException('shopify', 30000));

      await expect(service.test('t_1', 'shopify')).rejects.toBeInstanceOf(CircuitOpenException);
      expect(prisma.integration.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { lastCheckedAt: expect.any(Date) } }),
      );
      expect(notifications.notifyTenant).not.toHaveBeenCalled();
    });

    it('does not re-notify when a "Test connection" retry fails against an already-DEGRADED integration', async () => {
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        status: IntegrationStatus.DEGRADED,
        config: {},
        credential: { ciphertext: 'c', iv: 'i', authTag: 'a' },
      });
      shopifyAdapter.testConnection.mockRejectedValue(new Error('still unreachable'));

      await expect(service.test('t_1', 'shopify')).rejects.toBeInstanceOf(BadGatewayException);
      expect(notifications.notifyTenant).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('is a no-op when there is nothing to disconnect', async () => {
      prisma.integration.findUnique.mockResolvedValue(null);
      await service.disconnect('t_1', 'user_1', 'shopify');
      expect(prisma.integration.delete).not.toHaveBeenCalled();
    });

    it('best-effort unregisters the Shopify webhook, then deletes the row', async () => {
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        config: { shop: 'acme.myshopify.com', shopifyWebhookId: 'wh_1' },
        credential: { ciphertext: 'c', iv: 'i', authTag: 'a' },
      });

      await service.disconnect('t_1', 'user_1', 'shopify');

      expect(shopifyAdapter.unregisterWebhook).toHaveBeenCalledWith('decrypted-secret', 'acme.myshopify.com', 'wh_1');
      expect(prisma.integration.delete).toHaveBeenCalledWith({ where: { id: 'int_1' } });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 't_1',
          userId: 'user_1',
          action: 'integration.disconnected',
          resourceType: 'Integration',
          resourceId: 'int_1',
          metadata: { provider: IntegrationProvider.SHOPIFY },
        }),
      });
    });

    it('still deletes the row even if Shopify webhook cleanup fails', async () => {
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        config: { shop: 'acme.myshopify.com', shopifyWebhookId: 'wh_1' },
        credential: { ciphertext: 'c', iv: 'i', authTag: 'a' },
      });
      shopifyAdapter.unregisterWebhook.mockRejectedValue(new Error('shopify unreachable'));

      await service.disconnect('t_1', 'user_1', 'shopify');

      expect(prisma.integration.delete).toHaveBeenCalledWith({ where: { id: 'int_1' } });
    });
  });

  describe('getAdapter / getDecryptedCredential / updateCredential', () => {
    it('getAdapter delegates to the registry', () => {
      expect(service.getAdapter(IntegrationProvider.ZOHO_INVENTORY)).toBe(zohoAdapter);
    });

    it('getDecryptedCredential 404s when not connected', async () => {
      prisma.integration.findUnique.mockResolvedValue(null);
      await expect(
        service.getDecryptedCredential('t_1', IntegrationProvider.ZOHO_INVENTORY),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('getDecryptedCredential returns the decrypted secret, integrationId, and config', async () => {
      prisma.integration.findUnique.mockResolvedValue({
        id: 'int_1',
        config: { organizationId: 'org_1' },
        credential: { ciphertext: 'c', iv: 'i', authTag: 'a' },
      });

      const result = await service.getDecryptedCredential('t_1', IntegrationProvider.ZOHO_INVENTORY);

      expect(result).toEqual({
        integrationId: 'int_1',
        secret: 'decrypted-secret',
        config: { organizationId: 'org_1' },
      });
    });

    it('updateCredential re-encrypts and updates the credential row', async () => {
      await service.updateCredential('int_1', 'new-secret');

      expect(credentials.encrypt).toHaveBeenCalledWith('new-secret', 'int_1');
      expect(prisma.integrationCredential.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { integrationId: 'int_1' } }),
      );
    });
  });
});
