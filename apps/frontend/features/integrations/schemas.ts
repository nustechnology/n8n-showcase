import { z } from "zod";

import { integrationStatusSchema } from "@/lib/status";

// Verbatim backend enum (backend API contract §2) — the single source of
// truth the Provider type derives from via z.infer, so the schema and the
// type can't drift apart. integrationStatusSchema lives in lib/status.ts
// instead, alongside runStatusSchema, since both status vocabularies are
// shared by StatusBadge across features, not integration-specific.
export const providerSchema = z.enum(["SHOPIFY", "ZOHO_INVENTORY", "ODOO", "EASYPOST", "SHIPPO", "RESEND", "SENDGRID", "MAILGUN", "SLACK", "DISCORD"]);

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

// Matches the backend's own validation exactly (backend API contract §2) so a
// bad domain fails in the form, not after a round-trip.
export const shopifyConnectSchema = z.object({
  shop: z
    .string()
    .min(1, "Enter your shop domain")
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/, "Must look like your-store.myshopify.com"),
});
export type ShopifyConnectFormValues = z.infer<typeof shopifyConnectSchema>;

// Matches ConnectEasyPostSchema on the backend exactly — EasyPost requires an
// explicit ship-from address on every connect (no account-level default
// warehouse), so this can't reuse the flat ApiKeyConnectForm shape the way
// Resend/Slack do.
export const easyPostConnectSchema = z.object({
  apiKey: z.string().min(1, "Enter your API key"),
  fromAddress: z.object({
    name: z.string().min(1, "Enter a name"),
    company: z.string().optional(),
    street1: z.string().min(1, "Enter a street address"),
    street2: z.string().optional(),
    city: z.string().min(1, "Enter a city"),
    state: z.string().min(1, "Enter a state"),
    zip: z.string().min(1, "Enter a ZIP/postal code"),
    country: z.string().min(1, "Enter a country"),
    phone: z.string().optional(),
  }),
});
export type EasyPostConnectFormValues = z.infer<typeof easyPostConnectSchema>;
