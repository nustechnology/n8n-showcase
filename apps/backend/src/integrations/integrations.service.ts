import { randomBytes } from 'crypto';

import { BadGatewayException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Integration, IntegrationCredential, IntegrationProvider, IntegrationStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';
import { CircuitOpenException } from '../common/circuit-breaker/circuit-open.exception';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

import { CredentialsService } from '../credentials/credentials.service';

import { NotificationsService } from '../notifications/notifications.service';

import { verifyShopifyOAuthHmac } from './adapters/shopify-hmac.util';
import { ZohoInventoryAdapter } from './adapters/zoho-inventory.adapter';
import { ConnectDiscordSchema } from './dto/connect-discord.schema';
import { ConnectEasyPostSchema } from './dto/connect-easypost.schema';
import { ConnectOdooSchema } from './dto/connect-odoo.schema';
import { ConnectShippoSchema } from './dto/connect-shippo.schema';
import { ConnectMailgunSchema } from './dto/connect-mailgun.schema';
import { ConnectResendSchema } from './dto/connect-resend.schema';
import { ConnectSendGridSchema } from './dto/connect-sendgrid.schema';
import { ConnectShopifySchema } from './dto/connect-shopify.schema';
import { ConnectSlackSchema } from './dto/connect-slack.schema';
import { IntegrationAdapterRegistry } from './integration-adapter.registry';
import { IntegrationAdapter, OAuthAdapter } from './integration-adapter.interface';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export const MAILER_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.RESEND,
  IntegrationProvider.SENDGRID,
  IntegrationProvider.MAILGUN,
];

const ALERT_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.SLACK,
  IntegrationProvider.DISCORD,
];

const SHIPPING_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.EASYPOST,
  IntegrationProvider.SHIPPO,
];

const INVENTORY_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.ZOHO_INVENTORY,
  IntegrationProvider.ODOO,
];

const MUTUALLY_EXCLUSIVE_GROUPS: Array<{
  providers: IntegrationProvider[];
  label: string;
}> = [
  { providers: MAILER_PROVIDERS, label: 'mailer' },
  { providers: ALERT_PROVIDERS, label: 'alert service' },
  { providers: SHIPPING_PROVIDERS, label: 'shipping provider' },
  { providers: INVENTORY_PROVIDERS, label: 'inventory provider' },
];

// The individual mailers stay in GET /integrations with supported: true so
// the FE can compute aggregate mailer status for the grouped Mailer card.
// OPENAI is the only genuinely hidden provider (platform-level, never
// tenant-managed).
const HIDDEN_FROM_CATALOG: IntegrationProvider[] = [IntegrationProvider.OPENAI];
const SUPPORTED_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.SHOPIFY,
  IntegrationProvider.RESEND,
  IntegrationProvider.SENDGRID,
  IntegrationProvider.MAILGUN,
  IntegrationProvider.ZOHO_INVENTORY,
  IntegrationProvider.ODOO,
  IntegrationProvider.EASYPOST,
  IntegrationProvider.SHIPPO,
  IntegrationProvider.SLACK,
  IntegrationProvider.DISCORD,
];

export interface IntegrationSummary {
  provider: IntegrationProvider;
  supported: boolean;
  status: IntegrationStatus;
  displayHint: string | null;
  lastCheckedAt: Date | null;
  lastErrorMessage: string | null;
  config: Record<string, unknown>;
}

// OAuth callback route segments can be group names rather than individual
// provider names — resolve group names to the actual provider that handles
// OAuth for that group. Only inventory has an OAuth provider today; every
// other group uses api_key/webhook-based providers with no callback URL.
const GROUP_CALLBACK_PROVIDER: Record<string, IntegrationProvider> = {
  inventory: IntegrationProvider.ZOHO_INVENTORY,
};

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);
  private readonly frontendUrl: string;
  private readonly appBaseUrl: string;
  // Unlike frontendUrl/appBaseUrl (genuine app-wide infra, still
  // getOrThrow), this is a platform-level integration credential — `get`,
  // not `getOrThrow`, so a deployment that hasn't configured Shopify yet
  // still boots. handleShopifyCallback below treats a missing value as a
  // verification failure (redirect to ?status=error), same as any other
  // bad/forged callback, rather than crashing.
  private readonly shopifyClientSecret: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    private readonly credentials: CredentialsService,
    private readonly registry: IntegrationAdapterRegistry,
    private readonly notifications: NotificationsService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {
    this.frontendUrl = config.getOrThrow<string>('FRONTEND_URL');
    this.appBaseUrl = config.getOrThrow<string>('APP_BASE_URL');
    this.shopifyClientSecret = config.get<string>('SHOPIFY_CLIENT_SECRET');
  }

  async listForTenant(tenantId: string): Promise<IntegrationSummary[]> {
    const rows = await this.prisma.integration.findMany({
      where: { tenantId },
      include: { credential: true },
    });
    const byProvider = new Map(rows.map((row) => [row.provider, row]));

    return Object.values(IntegrationProvider)
      .filter((provider) => !HIDDEN_FROM_CATALOG.includes(provider))
      .map((provider) => {
        const row = byProvider.get(provider);
        return {
          provider,
          supported: this.isProviderUsable(provider),
          status: row?.status ?? IntegrationStatus.DISCONNECTED,
          displayHint: row?.credential?.displayHint ?? null,
          lastCheckedAt: row?.lastCheckedAt ?? null,
          lastErrorMessage: row?.lastErrorMessage ?? null,
          config: (row?.config as Record<string, unknown>) ?? {},
        };
      });
  }

  // "Supported" used to mean only "an adapter is registered for this
  // provider." As of the Zoho boot-crash fix, a registered OAuth adapter
  // can still be unusable — its platform-level app credentials (client
  // id/secret) just haven't been configured on this deployment yet. Both
  // conditions now have to hold for a provider to actually be connectable;
  // api_key adapters have no platform-level config, so they're usable
  // whenever they're registered at all.
  private isProviderUsable(provider: IntegrationProvider): boolean {
    if (!SUPPORTED_PROVIDERS.includes(provider)) return false;
    const adapter = this.registry.get(provider);
    return adapter.authType === 'oauth' ? adapter.isConfigured() : true;
  }

  async initConnect(
    tenantId: string,
    actorUserId: string,
    providerParam: string,
    body: unknown,
  ): Promise<{ authorizeUrl: string } | { status: IntegrationStatus }> {
    const provider = this.parseProvider(providerParam);
    const adapter = this.registry.get(provider);

    // Same 404 a genuinely-unregistered provider would produce — a
    // registered-but-unconfigured OAuth adapter (platform app credentials
    // not set up on this deployment yet) is indistinguishable from
    // "not supported" to the caller. GET /integrations already hides this
    // case behind supported: false; this is the defense-in-depth check for
    // a direct API call that skips that.
    if (adapter.authType === 'oauth' && !adapter.isConfigured()) {
      throw new NotFoundException(`Integration provider "${provider}" is not supported yet`);
    }

    const group = MUTUALLY_EXCLUSIVE_GROUPS.find((g) => g.providers.includes(provider));
    if (group) {
      const existing = await this.prisma.integration.findFirst({
        where: {
          tenantId,
          provider: { in: group.providers },
          status: { in: [IntegrationStatus.ACTIVE, IntegrationStatus.DEGRADED] },
        },
      });
      if (existing && existing.provider !== provider) {
        throw new ConflictException(
          `Another ${group.label} (${existing.provider}) is already active for this tenant. Disconnect it before connecting a different one.`,
        );
      }
    }

    if (adapter.authType === 'oauth') {
      const state = randomBytes(32).toString('hex');
      // Shopify needs a per-tenant shop domain up front; Zoho's authorize
      // URL needs only the state — no per-tenant subdomain concept, so its
      // config stays empty until the callback resolves an organization_id.
      let config: Record<string, unknown> = {};
      let connectParams: Record<string, string> = { state };
      if (provider === IntegrationProvider.SHOPIFY) {
        const { shop } = new ZodValidationPipe(ConnectShopifySchema).transform(body);
        config = { shop };
        connectParams = { shop, state };
      }

      await this.prisma.integration.upsert({
        where: { tenantId_provider: { tenantId, provider } },
        create: {
          tenantId,
          provider,
          status: IntegrationStatus.CONNECTING,
          oauthState: state,
          oauthStateExpiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
          config: config as Prisma.InputJsonValue,
        },
        update: {
          status: IntegrationStatus.CONNECTING,
          oauthState: state,
          oauthStateExpiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
          config: config as Prisma.InputJsonValue,
          lastErrorMessage: null,
        },
      });
      return { authorizeUrl: adapter.buildAuthorizeUrl(connectParams) };
    }

    const { value: secret, displayHintSource, config: apiKeyConfig } = this.parseApiKeyConnectInput(
      provider,
      body,
    );
    await adapter.validateKey(secret);

    const integration = await this.prisma.$transaction(async (tx) => {
      const integration = await tx.integration.upsert({
        where: { tenantId_provider: { tenantId, provider } },
        create: {
          tenantId,
          provider,
          status: IntegrationStatus.ACTIVE,
          config: (apiKeyConfig ?? {}) as Prisma.InputJsonValue,
        },
        update: {
          status: IntegrationStatus.ACTIVE,
          lastErrorMessage: null,
          ...(apiKeyConfig ? { config: apiKeyConfig as Prisma.InputJsonValue } : {}),
        },
      });
      const encrypted = this.credentials.encrypt(secret, integration.id);
      const displayHint = this.credentials.buildDisplayHint(displayHintSource);
      await tx.integrationCredential.upsert({
        where: { integrationId: integration.id },
        create: { integrationId: integration.id, ...encrypted, displayHint },
        update: { ...encrypted, displayHint, rotatedAt: new Date() },
      });
      return integration;
    });
    await this.writeAudit(tenantId, actorUserId, 'integration.connected', integration.id, { provider });
    return { status: IntegrationStatus.ACTIVE };
  }

  async handleCallback(
    providerParam: string,
    query: Record<string, string | undefined>,
  ): Promise<{ redirectUrl: string }> {
    const provider = this.resolveCallbackProvider(providerParam);
    const adapter = this.registry.get(provider);

    if (adapter.authType !== 'oauth' || !adapter.isConfigured()) {
      return { redirectUrl: `${this.frontendUrl}/integrations?status=error` };
    }
    if (provider === IntegrationProvider.SHOPIFY) {
      return this.handleShopifyCallback(query);
    }
    if (provider === IntegrationProvider.ZOHO_INVENTORY) {
      return this.handleZohoCallback(query, adapter as ZohoInventoryAdapter);
    }
    return { redirectUrl: `${this.frontendUrl}/integrations?status=error` };
  }

  async test(tenantId: string, providerParam: string): Promise<void> {
    const provider = this.parseProvider(providerParam);
    const adapter = this.registry.get(provider);
    const integration = await this.prisma.integration.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
      include: { credential: true },
    });
    if (!integration || !integration.credential) {
      throw new NotFoundException('Integration is not connected');
    }

    const secret = this.credentials.decrypt(integration.credential, integration.id);
    try {
      await this.circuitBreaker.fire(provider, () =>
        adapter.authType === 'oauth'
          ? adapter.testConnection(secret, integration.config as Record<string, unknown>)
          : adapter.testConnection(secret),
      );
      // A successful test now genuinely confirms health, not just credential
      // validity (ShopifyAdapter.testConnection also verifies the order
      // webhook is live) — safe to clear a DEGRADED status here without
      // reintroducing the "reads ACTIVE but silently never receives an
      // order" risk that DEGRADED exists to prevent.
      await this.prisma.integration.update({
        where: { id: integration.id },
        data: { lastCheckedAt: new Date(), lastErrorMessage: null, status: IntegrationStatus.ACTIVE },
      });
    } catch (error) {
      if (error instanceof CircuitOpenException) {
        // The breaker tripped before this call ever reached the third
        // party — that says nothing about whether this integration's own
        // credential/webhook is actually healthy, so don't touch status or
        // notify (a real DEGRADED transition means something different).
        // Record that a check was attempted and propagate the 503 as-is.
        await this.prisma.integration.update({
          where: { id: integration.id },
          data: { lastCheckedAt: new Date() },
        });
        throw error;
      }
      const message = (error as Error).message;
      await this.prisma.integration.update({
        where: { id: integration.id },
        data: {
          lastCheckedAt: new Date(),
          status: IntegrationStatus.DEGRADED,
          lastErrorMessage: message,
        },
      });
      // Only notify on the actual ACTIVE-or-better -> DEGRADED transition —
      // repeated "Test connection" clicks against an already-DEGRADED
      // integration shouldn't re-notify every active member each time.
      if (integration.status !== IntegrationStatus.DEGRADED) {
        await this.notifyStatus(tenantId, provider, IntegrationStatus.DEGRADED, message);
      }
      throw new BadGatewayException('Integration connectivity test failed');
    }
  }

  async disconnect(tenantId: string, actorUserId: string, providerParam: string): Promise<void> {
    const provider = this.parseProvider(providerParam);
    const integration = await this.prisma.integration.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
      include: { credential: true },
    });
    if (!integration) return; // already disconnected — idempotent

    if (provider === IntegrationProvider.SHOPIFY && integration.credential) {
      const config = integration.config as { shop?: string; shopifyWebhookId?: string; shopifyCheckoutWebhookId?: string };
      if (config.shop) {
        try {
          const token = this.credentials.decrypt(integration.credential, integration.id);
          const adapter = this.registry.get(provider) as OAuthAdapter;
          if (config.shopifyWebhookId) {
            await adapter.unregisterWebhook?.(token, config.shop, config.shopifyWebhookId);
          }
          if (config.shopifyCheckoutWebhookId) {
            await adapter.unregisterWebhook?.(token, config.shop, config.shopifyCheckoutWebhookId);
          }
        } catch (error) {
          // Best-effort — never block the disconnect on Shopify-side cleanup.
          this.logger.warn(
            `Failed to remove Shopify webhooks for integration ${integration.id}: ${(error as Error).message}`,
          );
        }
      }
    }

    await this.prisma.integration.delete({ where: { id: integration.id } });
    await this.writeAudit(tenantId, actorUserId, 'integration.disconnected', integration.id, { provider });
  }

  // Used by IntegrationActionsService (src/internal/) to resolve an
  // adapter without IntegrationsModule needing to export the registry
  // separately — IntegrationsService stays the only exported surface.
  getAdapter(provider: IntegrationProvider): IntegrationAdapter {
    return this.registry.get(provider);
  }

  async getDecryptedCredential(
    tenantId: string,
    provider: IntegrationProvider,
  ): Promise<{ integrationId: string; secret: string; config: Record<string, unknown> }> {
    const integration = await this.prisma.integration.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
      include: { credential: true },
    });
    if (!integration || !integration.credential) {
      throw new NotFoundException(`${provider} is not connected for this tenant`);
    }
    return {
      integrationId: integration.id,
      secret: this.credentials.decrypt(integration.credential, integration.id),
      config: integration.config as Record<string, unknown>,
    };
  }

  // Re-encrypts and stores a replacement secret for an already-connected
  // integration — used after ZohoInventoryAdapter.refreshToken() (called
  // from IntegrationActionsService, not here: this method only owns the
  // write, same split as every other IntegrationCredential mutation).
  async updateCredential(integrationId: string, newSecret: string): Promise<void> {
    const encrypted = this.credentials.encrypt(newSecret, integrationId);
    await this.prisma.integrationCredential.update({
      where: { integrationId },
      data: { ...encrypted, rotatedAt: new Date() },
    });
  }

  private async handleShopifyCallback(
    query: Record<string, string | undefined>,
  ): Promise<{ redirectUrl: string }> {
    const frontendUrl = this.frontendUrl;

    // 1. Verify HMAC — no Integration row resolvable yet, nowhere to record
    // a status against, so this is the one branch that's just a redirect.
    // A missing shopifyClientSecret (Shopify not configured on this
    // deployment) fails the same way a forged/invalid HMAC would — there's
    // no real Integration row behind this callback either way.
    if (!this.shopifyClientSecret || !verifyShopifyOAuthHmac(query, this.shopifyClientSecret)) {
      return { redirectUrl: `${frontendUrl}/integrations/shopify?status=error` };
    }

    const { state, shop, code } = query;

    // Resolve which tenant this callback belongs to up front — tolerating
    // an expired/missing state — purely to scope the redirect (mirrors
    // Zoho's `pending` lookup) and to give abandonPendingConnect() a row to
    // act on if this callback can't complete. Real, expiry-checked state
    // validation that gates the rest of the flow stays in
    // resolveIntegrationByState below.
    const pending = state
      ? await this.prisma.integration.findUnique({
          where: { oauthState: state },
          include: { credential: true },
        })
      : null;
    const { errorRedirect, successRedirect } = await this.buildCallbackRedirects(pending, 'shopify');

    if (!state || !shop || !code) {
      // Missing code means the user declined consent on Shopify's screen
      // (or a malformed callback) — clean up the stranded CONNECTING row
      // instead of leaving it stuck forever.
      await this.abandonPendingConnect(pending);
      return { redirectUrl: errorRedirect };
    }

    // 2. Resolve tenant via the state token — indexed unique lookup, this
    // time actually checking expiry (the tolerant `pending` lookup above
    // does not).
    const integration = await this.resolveIntegrationByState(state);
    if (!integration) {
      await this.abandonPendingConnect(pending);
      return { redirectUrl: errorRedirect };
    }

    // 3. The shop this callback is for must match the shop connect() was
    // called with — otherwise a state token minted for shop A could in
    // principle be completed against a different shop's authorization.
    const storedShop = (integration.config as { shop?: string }).shop;
    if (storedShop !== shop) {
      await this.failIntegration(
        integration.id,
        integration.tenantId,
        IntegrationProvider.SHOPIFY,
        integration.status,
        'Shop mismatch between connect and callback',
      );
      return { redirectUrl: errorRedirect };
    }

    // 4. No other tenant may already hold an ACTIVE integration for this
    // shop — otherwise both tenants' Order rows fill from the same store's
    // webhooks depending on which Integration row a lookup resolves to.
    const collision = await this.prisma.integration.findFirst({
      where: {
        provider: IntegrationProvider.SHOPIFY,
        status: IntegrationStatus.ACTIVE,
        NOT: { id: integration.id },
        config: { path: ['shop'], equals: shop },
      },
    });
    if (collision) {
      await this.failIntegration(
        integration.id,
        integration.tenantId,
        IntegrationProvider.SHOPIFY,
        integration.status,
        'This Shopify store is already connected to another workspace',
      );
      return { redirectUrl: errorRedirect };
    }

    const adapter = this.registry.get(IntegrationProvider.SHOPIFY) as OAuthAdapter;

    // 5. Exchange code for token.
    let token: string;
    try {
      token = await adapter.exchangeCodeForToken({ shop, code });
    } catch (error) {
      this.logger.error(`Shopify token exchange failed for integration ${integration.id}`, error as Error);
      await this.failIntegration(
        integration.id,
        integration.tenantId,
        IntegrationProvider.SHOPIFY,
        integration.status,
        'Token exchange with Shopify failed',
      );
      return { redirectUrl: errorRedirect };
    }

    // 6. Encrypt + store — AAD bound to this integration's id.
    const encrypted = this.credentials.encrypt(token, integration.id);
    const displayHint = this.credentials.buildDisplayHint(token);
    await this.prisma.integrationCredential.upsert({
      where: { integrationId: integration.id },
      create: { integrationId: integration.id, ...encrypted, displayHint },
      update: { ...encrypted, displayHint, rotatedAt: new Date() },
    });
    // No Clerk session on this callback — userId: null. The connect action
    // is still worth recording; it just has no attributable human actor.
    await this.writeAudit(integration.tenantId, null, 'integration.connected', integration.id, {
      provider: IntegrationProvider.SHOPIFY,
    });

    // 7. Register the order webhook and checkout webhook. The credential is
    // already valid and stored at this point, so a failure here is the
    // sharpest edge case: without explicit handling the integration would
    // read ACTIVE while silently never receiving any order.
    const callbackUrl = `${this.appBaseUrl}/webhooks/shopify/${integration.id}`;
    try {
      const { webhookId } = (await adapter.registerWebhook?.(token, shop, callbackUrl)) ?? {};
      if (!webhookId) {
        throw new Error('Shopify adapter did not return a webhookId');
      }
      const shopifyAdapter = adapter as unknown as { registerCheckoutWebhook?: (token: string, shop: string, callbackUrl: string) => Promise<{ webhookId: string }> };
      let checkoutWebhookId: string | undefined;
      try {
        const result = await shopifyAdapter.registerCheckoutWebhook?.(token, shop, callbackUrl);
        checkoutWebhookId = result?.webhookId;
        this.logger.log(`Registered checkout webhook for integration ${integration.id}: ${checkoutWebhookId}`);
      } catch (checkoutErr) {
        this.logger.warn(
          `Shopify checkout webhook registration failed for integration ${integration.id} — cart-reminder won't fire`,
          checkoutErr as Error,
        );
      }
      await this.prisma.integration.update({
        where: { id: integration.id },
        data: {
          status: IntegrationStatus.ACTIVE,
          oauthState: null,
          oauthStateExpiresAt: null,
          lastErrorMessage: null,
          lastCheckedAt: new Date(),
          config: { shop, shopifyWebhookId: webhookId, shopifyCheckoutWebhookId: checkoutWebhookId ?? undefined },
        },
      });
    } catch (error) {
      this.logger.error(`Shopify webhook registration failed for integration ${integration.id}`, error as Error);
      const message = 'Connected, but webhook registration failed — orders will not sync automatically';
      await this.prisma.integration.update({
        where: { id: integration.id },
        data: {
          status: IntegrationStatus.DEGRADED,
          oauthState: null,
          oauthStateExpiresAt: null,
          lastErrorMessage: message,
          config: { shop },
        },
      });
      // The connection itself succeeded — DEGRADED (surfaced via
      // GET /integrations) is the honest status, not a hard error redirect.
      await this.notifyStatus(integration.tenantId, IntegrationProvider.SHOPIFY, IntegrationStatus.DEGRADED, message);
    }

    return { redirectUrl: successRedirect };
  }

  // Zoho's OAuth callback has no HMAC-over-querystring scheme like
  // Shopify's — verification is just `state` matching a stored, unexpired
  // Integration.oauthState. No shop-equivalent concept, so no mismatch or
  // cross-tenant collision check either (Zoho org id is resolved, not
  // client-supplied, so there's no client value to collide on).
  private async handleZohoCallback(
    query: Record<string, string | undefined>,
    adapter: ZohoInventoryAdapter,
  ): Promise<{ redirectUrl: string }> {
    const { state, code } = query;

    // Resolve which tenant this callback belongs to up front — tolerating an
    // expired/missing state — purely to scope the redirect. The frontend only
    // serves the workspace-prefixed /{workspaceSlug}/integrations/:provider
    // route, so a bare /integrations/:provider error redirect would 404. The
    // real, expiry-checked state validation that gates the token exchange
    // stays in resolveIntegrationByState below.
    // `credential` is included so abandonPendingConnect() can tell a
    // genuinely-mid-flow row apart from one initConnect() re-upserted over
    // an already-connected integration.
    const pending = state
      ? await this.prisma.integration.findUnique({
          where: { oauthState: state },
          include: { credential: true },
        })
      : null;
    const { errorRedirect, successRedirect } = await this.buildCallbackRedirects(
      pending,
      'inventory',
    );

    if (!state || !code) {
      // Missing code means the user declined consent on Zoho's screen (or
      // Zoho sent an `error` param instead) — clean up the stranded
      // CONNECTING row instead of leaving it stuck forever.
      await this.abandonPendingConnect(pending);
      return { redirectUrl: errorRedirect };
    }

    const integration = await this.resolveIntegrationByState(state);
    if (!integration) {
      await this.abandonPendingConnect(pending);
      return { redirectUrl: errorRedirect };
    }

    let secret: string;
    try {
      secret = await adapter.exchangeCodeForToken({ code });
    } catch (error) {
      this.logger.error(`Zoho token exchange failed for integration ${integration.id}`, error as Error);
      await this.failIntegration(
        integration.id,
        integration.tenantId,
        IntegrationProvider.ZOHO_INVENTORY,
        integration.status,
        'Token exchange with Zoho failed',
      );
      return { redirectUrl: errorRedirect };
    }

    let organizationId: string;
    try {
      organizationId = await adapter.fetchDefaultOrganizationId(secret);
    } catch (error) {
      this.logger.error(
        `Failed to resolve a Zoho organization for integration ${integration.id}`,
        error as Error,
      );
      await this.failIntegration(
        integration.id,
        integration.tenantId,
        IntegrationProvider.ZOHO_INVENTORY,
        integration.status,
        'Could not resolve a Zoho Inventory organization for this account',
      );
      return { redirectUrl: errorRedirect };
    }

    const encrypted = this.credentials.encrypt(secret, integration.id);
    const displayHint = this.credentials.buildDisplayHint((JSON.parse(secret) as { accessToken: string }).accessToken);
    await this.prisma.integrationCredential.upsert({
      where: { integrationId: integration.id },
      create: { integrationId: integration.id, ...encrypted, displayHint },
      update: { ...encrypted, displayHint, rotatedAt: new Date() },
    });
    await this.prisma.integration.update({
      where: { id: integration.id },
      data: {
        status: IntegrationStatus.ACTIVE,
        oauthState: null,
        oauthStateExpiresAt: null,
        lastErrorMessage: null,
        lastCheckedAt: new Date(),
        config: { organizationId },
      },
    });
    // No Clerk session on this callback — userId: null, same as Shopify's.
    await this.writeAudit(integration.tenantId, null, 'integration.connected', integration.id, {
      provider: IntegrationProvider.ZOHO_INVENTORY,
    });

    return { redirectUrl: successRedirect };
  }

  private async resolveIntegrationByState(state: string): Promise<Integration | null> {
    const integration = await this.prisma.integration.findUnique({ where: { oauthState: state } });
    if (!integration || !integration.oauthStateExpiresAt || integration.oauthStateExpiresAt < new Date()) {
      return null;
    }
    return integration;
  }

  // Shared by every OAuth callback branch — identical shape (resolve tenant
  // slug, build the two redirect URLs), differing only in which provider's
  // frontend path segment gets used.
  private async buildCallbackRedirects(
    integration: Integration | null,
    providerPathSegment: string,
  ): Promise<{ errorRedirect: string; successRedirect: string }> {
    // No resolvable tenant (missing/unknown state, or a forged callback) —
    // there's no workspace slug to scope the path to, so fall back to the app
    // root, which routes a logged-in user to their own workspace. Never a
    // success path: a connection can't complete without a tenant.
    if (!integration) {
      return {
        errorRedirect: `${this.frontendUrl}?status=error`,
        successRedirect: `${this.frontendUrl}?status=error`,
      };
    }
    const tenant = await this.prisma.tenant.findUnique({ where: { id: integration.tenantId } });
    const tenantSlug = tenant?.slug ?? integration.tenantId;
    return {
      errorRedirect: `${this.frontendUrl}/${tenantSlug}/integrations/${providerPathSegment}?status=error`,
      successRedirect: `${this.frontendUrl}/${tenantSlug}/integrations/${providerPathSegment}?status=success`,
    };
  }

  // Cleanup for an OAuth callback that can't complete (user declined
  // consent — no `code` — or the state token is unknown/expired). Without
  // this, the Integration row initConnect() created is stranded at
  // CONNECTING forever: the frontend gates "Test connection"/"Disconnect"
  // on `status !== "DISCONNECTED"`, so a stuck CONNECTING row permanently
  // reads as "there's something real here to test/disconnect," even though
  // no IntegrationCredential was ever written. Deleting outright (rather
  // than resetting a status column) mirrors disconnect()'s own idempotent
  // delete, and produces the identical GET /integrations response shape —
  // listForTenant() already treats a missing row as DISCONNECTED.
  //
  // Deliberately not failIntegration(): declining consent, or taking too
  // long to decide, is an expected, benign user choice, not a
  // platform-detected problem worth a tenant-wide "integration error"
  // notification.
  private async abandonPendingConnect(
    integration: (Integration & { credential: IntegrationCredential | null }) | null,
  ): Promise<void> {
    // Only ever touch a row still genuinely mid-flight. initConnect()'s
    // upsert unconditionally sets CONNECTING even if re-run against an
    // already-connected integration — no UI path does this today (the
    // documented fix for a broken OAuth integration is always
    // disconnect-then-connect), but a direct API call bypassing the UI
    // could. If a credential already exists, deleting here would
    // cascade-delete a still-valid one — leave the row alone instead; a
    // stuck CONNECTING badge in that edge case is a display-only
    // inconsistency, not data loss.
    if (!integration || integration.status !== IntegrationStatus.CONNECTING || integration.credential) {
      return;
    }
    await this.prisma.integration.delete({ where: { id: integration.id } });
  }

  // Per-provider connect-body parsing for the api_key branch — the DTOs
  // differ (Resend: apiKey; EasyPost: apiKey+fromAddress; Slack:
  // webhookUrl), so this stays a small provider switch, same as it always
  // has been (previously inline in initConnect for Resend alone). Returns
  // the opaque `value` to encrypt, a human-relevant `displayHintSource`,
  // and an optional non-secret `config` (EasyPost's fromAddress isn't a
  // secret — stored alongside the encrypted credential, same as Shopify's
  // `shop`, rather than folded into the encrypted value).
  private parseApiKeyConnectInput(
    provider: IntegrationProvider,
    body: unknown,
  ): { value: string; displayHintSource: string; config?: Record<string, unknown> } {
    if (provider === IntegrationProvider.RESEND) {
      const { apiKey } = new ZodValidationPipe(ConnectResendSchema).transform(body);
      return { value: apiKey, displayHintSource: apiKey };
    }
    if (provider === IntegrationProvider.SENDGRID) {
      const { apiKey } = new ZodValidationPipe(ConnectSendGridSchema).transform(body);
      return { value: apiKey, displayHintSource: apiKey };
    }
    if (provider === IntegrationProvider.MAILGUN) {
      const { domain, apiKey } = new ZodValidationPipe(ConnectMailgunSchema).transform(body);
      return {
        value: JSON.stringify({ domain, key: apiKey }),
        displayHintSource: apiKey,
      };
    }
    if (provider === IntegrationProvider.EASYPOST) {
      const { apiKey, fromAddress } = new ZodValidationPipe(ConnectEasyPostSchema).transform(body);
      return { value: apiKey, displayHintSource: apiKey, config: { fromAddress } };
    }
    if (provider === IntegrationProvider.SHIPPO) {
      const { apiKey, fromAddress } = new ZodValidationPipe(ConnectShippoSchema).transform(body);
      return { value: apiKey, displayHintSource: apiKey, config: { fromAddress } };
    }
    if (provider === IntegrationProvider.ODOO) {
      const { url, db, username, apiKey } = new ZodValidationPipe(ConnectOdooSchema).transform(body);
      return {
        value: JSON.stringify({ url, db, username, apiKey }),
        displayHintSource: apiKey,
      };
    }
    if (provider === IntegrationProvider.SLACK) {
      const { webhookUrl } = new ZodValidationPipe(ConnectSlackSchema).transform(body);
      return { value: webhookUrl, displayHintSource: webhookUrl };
    }
    if (provider === IntegrationProvider.DISCORD) {
      const { webhookUrl } = new ZodValidationPipe(ConnectDiscordSchema).transform(body);
      return { value: webhookUrl, displayHintSource: webhookUrl };
    }
    throw new NotFoundException(`API-key connect not implemented for "${provider}"`);
  }

  private async failIntegration(
    integrationId: string,
    tenantId: string,
    provider: IntegrationProvider,
    previousStatus: IntegrationStatus,
    message: string,
  ): Promise<void> {
    await this.prisma.integration.update({
      where: { id: integrationId },
      data: {
        status: IntegrationStatus.ERROR,
        lastErrorMessage: message,
        oauthState: null,
        oauthStateExpiresAt: null,
      },
    });
    // Only notify on the actual transition into ERROR — a retried OAuth
    // callback that fails the same way twice shouldn't re-notify every
    // active member each time.
    if (previousStatus !== IntegrationStatus.ERROR) {
      await this.notifyStatus(tenantId, provider, IntegrationStatus.ERROR, message);
    }
  }

  // Every DEGRADED/ERROR transition raises a tenant-wide notification —
  // these are real, platform-detected problems (not a general-purpose event
  // log), so every currently-active member should see one.
  private async notifyStatus(
    tenantId: string,
    provider: IntegrationProvider,
    status: IntegrationStatus,
    message: string,
  ): Promise<void> {
    await this.notifications.notifyTenant(tenantId, {
      type: status === IntegrationStatus.ERROR ? 'integration_error' : 'integration_degraded',
      title: `${provider} integration ${status === IntegrationStatus.ERROR ? 'failed' : 'needs attention'}`,
      body: message,
      payload: { provider, status },
    });
  }

  // Same shape as MembersService's private writeAudit — each writer owns
  // its own small helper straight against PrismaService rather than a
  // shared audit-writing service (see src/audit-log/, which is read-only).
  // userId is nullable here specifically because the two OAuth callback
  // paths above are @Public() (no Clerk session, verified by HMAC/state
  // instead) and have no actor to attribute.
  private async writeAudit(
    tenantId: string,
    userId: string | null,
    action: string,
    resourceId: string | undefined,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action,
        resourceType: 'Integration',
        resourceId: resourceId ?? null,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }

  private resolveCallbackProvider(providerParam: string): IntegrationProvider {
    const groupProvider = GROUP_CALLBACK_PROVIDER[providerParam.toLowerCase()];
    if (groupProvider) return groupProvider;
    return this.parseProvider(providerParam);
  }

  private parseProvider(value: string): IntegrationProvider {
    const upper = value.toUpperCase();
    const match = Object.values(IntegrationProvider).find((p) => p === upper);
    if (!match) {
      throw new NotFoundException(`Unknown integration provider "${value}"`);
    }
    return match;
  }
}
