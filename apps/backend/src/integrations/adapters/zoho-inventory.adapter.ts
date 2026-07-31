import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { IntegrationProvider } from '@prisma/client';

import { fetchWithTimeout } from '../../common/http/fetch-with-timeout.util';

import { OAuthAdapter } from '../integration-adapter.interface';

const ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.com';
const ZOHO_API_URL = 'https://www.zohoapis.com/inventory/v1';

interface ZohoCredential {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

// Real OAuth2 — Zoho Inventory has no static-key mode. Stores the
// access+refresh token pair as a single JSON-stringified string (the opaque
// "credential" every OAuthAdapter method deals in) — CredentialsService and
// IntegrationsService never parse this shape themselves, only this adapter
// does, on both ends (stringify here, JSON.parse in every method below).
@Injectable()
export class ZohoInventoryAdapter implements OAuthAdapter {
  readonly provider = IntegrationProvider.ZOHO_INVENTORY;
  readonly authType = 'oauth' as const;

  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly appBaseUrl: string;

  // Same reasoning as ShopifyAdapter: client id/secret are `get`, not
  // `getOrThrow` — a platform-level credential this deployment can
  // legitimately not have configured yet, not app-wide infra like
  // APP_BASE_URL. Missing values surface via isConfigured()/
  // assertConfigured() below, never a boot crash.
  constructor(config: ConfigService) {
    this.clientId = config.get<string>('ZOHO_CLIENT_ID');
    this.clientSecret = config.get<string>('ZOHO_CLIENT_SECRET');
    this.appBaseUrl = config.getOrThrow<string>('APP_BASE_URL');
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  // Belt-and-suspenders — IntegrationsService checks isConfigured() before
  // ever reaching this adapter for a real connect attempt; see
  // ShopifyAdapter.assertConfigured() for the full reasoning.
  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Zoho Inventory integration is not configured on this platform');
    }
  }

  private get redirectUri(): string {
    return `${this.appBaseUrl}/integrations/inventory/callback`;
  }

  buildAuthorizeUrl(params: Record<string, string>): string {
    this.assertConfigured();
    const query = new URLSearchParams({
      client_id: this.clientId!,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: 'ZohoInventory.FullAccess.all',
      access_type: 'offline',
      prompt: 'consent',
      state: params.state,
    });
    return `${ZOHO_ACCOUNTS_URL}/oauth/v2/auth?${query.toString()}`;
  }

  async exchangeCodeForToken(params: Record<string, string>): Promise<string> {
    this.assertConfigured();
    const res = await fetchWithTimeout(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        redirect_uri: this.redirectUri,
        code: params.code,
      }),
    });
    if (!res.ok) {
      throw new BadGatewayException(`Zoho token exchange failed: ${res.status}`);
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    return JSON.stringify({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    } satisfies ZohoCredential);
  }

  // Zoho's refresh response carries no new refresh token — the original one
  // keeps working until the user revokes access, so it's carried forward.
  async refreshToken(currentCredential: string): Promise<string> {
    this.assertConfigured();
    const { refreshToken } = JSON.parse(currentCredential) as ZohoCredential;
    const res = await fetchWithTimeout(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) {
      throw new BadGatewayException(`Zoho token refresh failed: ${res.status}`);
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    return JSON.stringify({
      accessToken: data.access_token,
      refreshToken,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    } satisfies ZohoCredential);
  }

  async testConnection(credential: string): Promise<void> {
    const { accessToken } = JSON.parse(credential) as ZohoCredential;
    const res = await fetchWithTimeout(`${ZOHO_API_URL}/organizations`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });
    if (!res.ok) {
      throw new BadGatewayException(`Zoho connection test failed: ${res.status}`);
    }
  }

  // Not part of OAuthAdapter — called once, right after a successful
  // handleCallback exchange, to resolve the organization_id every other
  // Zoho Inventory API call requires (Zoho accounts can hold multiple
  // organizations; this app supports connecting the first/default one,
  // same scope as every other single-tenant-per-integration assumption
  // already made elsewhere in this app).
  async fetchDefaultOrganizationId(credential: string): Promise<string> {
    const { accessToken } = JSON.parse(credential) as ZohoCredential;
    const res = await fetchWithTimeout(`${ZOHO_API_URL}/organizations`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });
    if (!res.ok) {
      throw new BadGatewayException(`Failed to resolve Zoho organization: ${res.status}`);
    }
    const data = (await res.json()) as { organizations?: { organization_id: string }[] };
    const organizationId = data.organizations?.[0]?.organization_id;
    if (!organizationId) {
      throw new BadGatewayException('No Zoho Inventory organization found on this account');
    }
    return organizationId;
  }

  // On a 401 specifically, throws UnauthorizedException rather than
  // BadGatewayException — IntegrationActionsService catches exactly this to
  // trigger a refresh-and-retry-once, never a generic upstream failure.
  async checkInventory(
    credential: string,
    orderItems: { sku: string; quantity: number }[],
    organizationId: string,
  ): Promise<{ inStock: boolean; availableQuantity?: number }> {
    const { accessToken } = JSON.parse(credential) as ZohoCredential;
    const checkable = orderItems.filter((item) => item.sku);
    if (checkable.length === 0) {
      return { inStock: true };
    }

    let minAvailable: number | undefined;
    for (const item of checkable) {
      const query = new URLSearchParams({ organization_id: organizationId, sku: item.sku });
      const res = await fetchWithTimeout(`${ZOHO_API_URL}/items?${query.toString()}`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      });
      if (res.status === 401) {
        throw new UnauthorizedException('Zoho access token expired');
      }
      if (!res.ok) {
        throw new BadGatewayException(`Zoho inventory lookup failed: ${res.status}`);
      }
      const data = (await res.json()) as { items?: { available_stock?: number }[] };
      const available = data.items?.[0]?.available_stock ?? 0;
      minAvailable = minAvailable === undefined ? available : Math.min(minAvailable, available);
      if (available < item.quantity) {
        return { inStock: false, availableQuantity: available };
      }
    }

    return { inStock: true, availableQuantity: minAvailable };
  }
}
