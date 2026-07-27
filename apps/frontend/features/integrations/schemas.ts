import { z } from "zod";

import {
  publicProviderSchema,
  integrationStatusSchema,
  ConnectShopifySchema,
  ConnectEasyPostSchema,
  type ConnectShopifyInput,
  type ConnectEasyPostInput,
  type PublicProvider,
} from "@n8n-showcase/shared-schemas";

export const providerSchema = publicProviderSchema;
export type Provider = PublicProvider;

export const integrationSchema = z.object({
  provider: providerSchema,
  supported: z.boolean(),
  status: integrationStatusSchema,
  displayHint: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
  lastErrorMessage: z.string().nullable(),
  config: z.record(z.string(), z.unknown()),
});

export const integrationsResponseSchema = z.array(integrationSchema);

// Shared by every OAuth-style connect (Shopify, Zoho Inventory) — both hand
// off via a full-page redirect to `authorizeUrl`, not a client-side nav.
export const oauthConnectResponseSchema = z.object({
  authorizeUrl: z.string(),
});

// Shared by every apiKey-style connect (Resend, EasyPost, Slack) — same
// response shape across all three, only the request body's field names
// differ per provider (see ApiKeyConnectForm).
export const apiKeyConnectResponseSchema = z.object({
  status: z.literal("ACTIVE"),
});

export const shopifyConnectSchema = ConnectShopifySchema;
export type ShopifyConnectFormValues = ConnectShopifyInput;

export const easyPostConnectSchema = ConnectEasyPostSchema;
export type EasyPostConnectFormValues = ConnectEasyPostInput;
