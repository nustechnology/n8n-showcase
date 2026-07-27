import { IntegrationProvider } from '@prisma/client';

// Adapters only ever talk to the third party — no Prisma access. All DB
// writes and status transitions live in IntegrationsService. Mirrors the
// existing ClerkVerifierService/ClerkTenantGuard split (verifier is pure,
// guard owns orchestration + persistence).

export interface OAuthAdapter {
  provider: IntegrationProvider;
  authType: 'oauth';
  // True when this adapter's platform-level app credentials (client
  // id/secret) are actually present in config. Nest still constructs this
  // adapter either way — DI needs a concrete instance for every provider in
  // the registry, configured or not — so a provider whose platform
  // credentials haven't been set up yet must never crash boot; it just
  // reports itself unusable and IntegrationsService treats it as
  // unsupported (GET /integrations, initConnect) until it is.
  isConfigured(): boolean;
  // A loose bag, not a fixed {shop,state} shape — Shopify needs {shop,state},
  // Zoho needs {state} only (no per-tenant subdomain concept). Each adapter
  // destructures what it needs.
  buildAuthorizeUrl(params: Record<string, string>): string;
  // Returns whatever string this adapter wants encrypted+stored — opaque to
  // every caller. Shopify returns the bare access token (unchanged: existing
  // encrypted rows are plain strings, this must stay that way). An adapter
  // with more than one value to persist (e.g. Zoho's access+refresh token
  // pair) JSON-stringifies internally and returns that instead.
  exchangeCodeForToken(params: Record<string, string>): Promise<string>;
  testConnection(credential: string, config: Record<string, unknown>): Promise<void>;
  // Shopify-only concept (order webhook subscription) — an OAuth provider
  // with no inbound webhook in its design (e.g. Zoho, polled via its own
  // action endpoint instead) doesn't implement these.
  registerWebhook?(
    token: string,
    shop: string,
    callbackUrl: string,
  ): Promise<{ webhookId: string }>;
  unregisterWebhook?(token: string, shop: string, webhookId: string): Promise<void>;
  // Takes the current decrypted credential, returns a new one to re-encrypt
  // and store. Only implemented by adapters whose tokens actually expire
  // (Zoho); unused by Shopify/Resend.
  refreshToken?(currentCredential: string): Promise<string>;
}

export interface ApiKeyAdapter {
  provider: IntegrationProvider;
  authType: 'api_key';
  // `secret` is opaque to every caller — every current api_key provider
  // (Resend, EasyPost, Slack) happens to use a bare single value, but a
  // future provider needing more than one (e.g. a key+secret pair) would
  // JSON-stringify its own shape into this string before it ever reaches
  // the adapter, the same way ZohoInventoryAdapter (an OAuthAdapter) does
  // for its access+refresh token pair — the adapter parses its own shape
  // back out, `CredentialsService`/`IntegrationsService` never do.
  validateKey(secret: string): Promise<void>;
  testConnection(secret: string): Promise<void>;
}

export type IntegrationAdapter = OAuthAdapter | ApiKeyAdapter;
