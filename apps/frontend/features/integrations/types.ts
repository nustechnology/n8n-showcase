import type { z } from "zod";

import type { apiKeyConnectResponseSchema, integrationSchema, oauthConnectResponseSchema, providerSchema } from "./schemas";

export type Provider = z.infer<typeof providerSchema>;

/** Verbatim GET /integrations entry shape (backend API contract §2). Always 5 rows, one per catalog provider. Validated at the API boundary — see api.ts. */
export type Integration = z.infer<typeof integrationSchema>;

export interface ShopifyConnectRequest {
  shop: string;
}

/** Shared response shape for every OAuth-style connect (Shopify, Zoho Inventory). */
export type OauthConnectResponse = z.infer<typeof oauthConnectResponseSchema>;

/** One string field per form field — e.g. `{ apiKey }` for Resend and Slack. */
export type ApiKeyConnectRequest = Record<string, string>;

/** EasyPost's connect body, unlike the other apiKey providers, isn't flat — it needs a ship-from address alongside the key (backend API contract §2). */
export interface EasyPostConnectRequest {
  apiKey: string;
  fromAddress: {
    name: string;
    company?: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone?: string;
  };
}

/** Shared response shape for every apiKey-style connect (Resend, EasyPost, Slack). */
export type ApiKeyConnectResponse = z.infer<typeof apiKeyConnectResponseSchema>;
