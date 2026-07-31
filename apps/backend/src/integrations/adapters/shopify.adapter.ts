import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { IntegrationProvider } from '@prisma/client';

import { OAuthAdapter } from '../integration-adapter.interface';

const SHOPIFY_API_VERSION = '2026-07';

@Injectable()
export class ShopifyAdapter implements OAuthAdapter {
  readonly provider = IntegrationProvider.SHOPIFY;
  readonly authType = 'oauth' as const;

  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly scopes: string | undefined;
  private readonly appBaseUrl: string;

  // Client id/secret/scopes are read with `get`, not `getOrThrow` — unlike
  // APP_BASE_URL (genuine app-wide infra config, still required), these are
  // a platform-level integration credential a given deployment can
  // legitimately not have configured yet. Nest still builds this adapter at
  // boot either way (DI needs a concrete instance regardless), so a missing
  // value here must never crash the app — see isConfigured()/assertConfigured()
  // below, which is where "not set up yet" actually surfaces.
  constructor(config: ConfigService) {
    this.clientId = config.get<string>('SHOPIFY_CLIENT_ID');
    this.clientSecret = config.get<string>('SHOPIFY_CLIENT_SECRET');
    this.scopes = config.get<string>('SHOPIFY_SCOPES');
    this.appBaseUrl = config.getOrThrow<string>('APP_BASE_URL');
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.scopes);
  }

  // Belt-and-suspenders — IntegrationsService already checks isConfigured()
  // before ever routing a real connect attempt to this adapter (GET
  // /integrations reports it unsupported, initConnect 404s), so this should
  // never actually throw in practice. It exists so a future caller that
  // skips that check fails with a clear message instead of a raw
  // "Cannot read properties of undefined."
  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Shopify integration is not configured on this platform');
    }
  }

  buildAuthorizeUrl({ shop, state }: { shop: string; state: string }): string {
    this.assertConfigured();
    const params = new URLSearchParams({
      client_id: this.clientId!,
      scope: this.scopes!,
      redirect_uri: `${this.appBaseUrl}/integrations/shopify/callback`,
      state,
    });
    return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken({ shop, code }: { shop: string; code: string }): Promise<string> {
    this.assertConfigured();
    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        code,
      }),
    });
    if (!res.ok) {
      throw new BadGatewayException(`Shopify token exchange failed: ${res.status}`);
    }
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }

  async registerWebhook(
    token: string,
    shop: string,
    callbackUrl: string,
  ): Promise<{ webhookId: string }> {
    const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({
        webhook: { topic: 'orders/create', address: callbackUrl, format: 'json' },
      }),
    });
    if (!res.ok) {
      throw new BadGatewayException(`Shopify webhook registration failed: ${res.status}`);
    }
    const data = (await res.json()) as { webhook: { id: number } };
    return { webhookId: String(data.webhook.id) };
  }

  async unregisterWebhook(token: string, shop: string, webhookId: string): Promise<void> {
    const res = await fetch(
      `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/webhooks/${webhookId}.json`,
      { method: 'DELETE', headers: { 'X-Shopify-Access-Token': token } },
    );
    if (!res.ok) {
      throw new BadGatewayException(`Shopify webhook deletion failed: ${res.status}`);
    }
  }

  // Writes fulfillment/tracking info back into Shopify — scoped in the
  // original architecture doc, never built until this round. Not part of
  // OAuthAdapter (no other provider has an equivalent), called directly by
  // IntegrationActionsService.
  async updateOrder(
    token: string,
    shop: string,
    shopifyOrderId: string,
    trackingInfo: { trackingNumber: string; carrier: string; lineItems: { id: number; quantity: number }[] },
  ): Promise<void> {
    const gidOrder = `gid://shopify/Order/${shopifyOrderId}`;

    const fulfillmentOrders = await this.fetchFulfillmentOrders(token, shop, gidOrder);
    if (!fulfillmentOrders.length) {
      throw new BadGatewayException('Order has no fulfillment orders');
    }

    const lineItemsByFulfillmentOrder = fulfillmentOrders.map((fo) => ({
      fulfillmentOrderId: fo.id,
      fulfillmentOrderLineItems: fo.lineItems.map((li) => ({
        id: li.id,
        quantity: li.quantity,
      })),
    }));

    const query = `
      mutation fulfillmentCreate($fulfillment: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $fulfillment) {
          fulfillment { id status }
          userErrors { field message }
        }
      }
    `;
    const variables = {
      fulfillment: {
        lineItemsByFulfillmentOrder,
        trackingInfo: {
          number: trackingInfo.trackingNumber,
          company: trackingInfo.carrier,
        },
        notifyCustomer: false,
      },
    };

    const res = await fetch(
      `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ query, variables }),
      },
    );
    if (!res.ok) {
      throw new BadGatewayException(`Shopify fulfillment update failed: ${res.status}`);
    }

    const result = (await res.json()) as {
      data?: { fulfillmentCreate?: { fulfillment?: unknown; userErrors?: { field: string; message: string }[] } };
      errors?: { message: string }[];
    };

    const userErrors = result.data?.fulfillmentCreate?.userErrors;
    const graphqlErrors = result.errors;
    if (userErrors?.length) {
      throw new BadGatewayException(
        `Shopify fulfillment create failed: ${userErrors.map((e) => `${e.field}: ${e.message}`).join('; ')}`,
      );
    }
    if (graphqlErrors?.length) {
      throw new BadGatewayException(
        `Shopify GraphQL error: ${graphqlErrors.map((e) => e.message).join('; ')}`,
      );
    }
  }

  private async fetchFulfillmentOrders(
    token: string,
    shop: string,
    gidOrder: string,
  ): Promise<{ id: string; lineItems: { id: string; quantity: number }[] }[]> {
    const query = `
      query getFulfillmentOrders($orderId: ID!) {
        order(id: $orderId) {
          fulfillmentOrders(first: 10) {
            edges {
              node {
                id
                lineItems(first: 10) {
                  edges {
                    node {
                      id
                      remainingQuantity
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    const res = await fetch(
      `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ query, variables: { orderId: gidOrder } }),
      },
    );
    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      throw new BadGatewayException(`Shopify fulfillment orders query failed: ${res.status} — ${errorBody.slice(0, 300)}`);
    }
    const result = (await res.json()) as {
      data?: {
        order?: {
          fulfillmentOrders?: {
            edges?: {
              node: {
                id: string;
                lineItems?: {
                  edges?: {
                    node: { id: string; remainingQuantity: number };
                  }[];
                };
              };
            }[];
          };
        };
      };
      errors?: { message: string }[];
    };

    if (result.errors?.length) {
      throw new BadGatewayException(
        `Shopify fulfillment orders query error: ${result.errors.map((e) => e.message).join('; ')}`,
      );
    }

    const orders = result.data?.order?.fulfillmentOrders?.edges ?? [];
    return orders.map((edge) => ({
      id: edge.node.id,
      lineItems: (edge.node.lineItems?.edges ?? []).map((li) => ({
        id: li.node.id,
        quantity: Number(li.node.remainingQuantity),
      })),
    }));
  }

  private async fetchFirstLocationId(token: string, shop: string): Promise<number> {
    const res = await fetch(
      `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/locations.json`,
      { headers: { 'X-Shopify-Access-Token': token } },
    );
    if (!res.ok) {
      throw new BadGatewayException(`Shopify locations fetch failed: ${res.status}`);
    }
    const data = (await res.json()) as { locations: { id: number }[] };
    if (!data.locations?.length) {
      throw new BadGatewayException('Shopify store has no locations configured');
    }
    return data.locations[0].id;
  }

  async testConnection(credential: string, config: Record<string, unknown>): Promise<void> {
    const shop = config.shop as string;
    const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
      headers: { 'X-Shopify-Access-Token': credential },
    });
    if (!res.ok) {
      throw new BadGatewayException(`Shopify connection test failed: ${res.status}`);
    }

    // Credential validity alone isn't "healthy" — a DEGRADED integration
    // (connect-time webhook registration failure) has a perfectly valid
    // credential and would pass the check above every time, hiding that
    // orders still aren't syncing. IntegrationsService.test() uses this
    // method's success to decide whether to clear DEGRADED back to ACTIVE,
    // so it has to actually verify the webhook is live, not just that the
    // token works. Both calls stay read-only (GET), same as the shop.json
    // check — "test" never side-effects.
    const webhookId = config.shopifyWebhookId as string | undefined;
    if (!webhookId) {
      throw new BadGatewayException(
        'Shopify credentials are valid, but no order webhook is registered — disconnect and reconnect to finish setup.',
      );
    }
    const webhookRes = await fetch(
      `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/webhooks/${webhookId}.json`,
      { headers: { 'X-Shopify-Access-Token': credential } },
    );
    if (!webhookRes.ok) {
      throw new BadGatewayException(
        'Shopify credentials are valid, but the order webhook is missing or was removed — disconnect and reconnect to finish setup.',
      );
    }
  }
}
