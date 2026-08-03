import type { ReactNode } from "react";

import type { Provider } from "@/features/integrations/types";
import type { ApiKeyField } from "@/components/domain/api-key-connect-form";

export interface ConnectGuideStep {
  title: string;
  detail: ReactNode;
}

export type CatalogProvider = Provider | "MAILER" | "ALERTS" | "SHIPPING" | "INVENTORY";

/**
 * Display metadata only — name/description/authMethod aren't in the backend's
 * response, so they're hardcoded here. Everything else (supported, status,
 * displayHint...) comes from GET /integrations at request time; never
 * hardcode those, the backend is the source of truth for them.
 */
export interface ProviderMeta {
  provider: CatalogProvider;
  name: string;
  description: string;
  authMethod: "oauth" | "apiKey";
  /** Drives ApiKeyConnectForm's fields — every apiKey provider except EasyPost, which has its own dedicated form (nested fromAddress, not a flat field list). */
  apiKeyFields?: ApiKeyField[];
  /** Powers the "How to connect" dialog on the integration detail page. */
  connectGuide: ConnectGuideStep[];
  /** Which workflows this provider appears in. Defaults to both if omitted. */
  workflows?: string[];
}

/**
 * Order here is display order. n8n and AI validation (OpenAI) are
 * deliberately absent — hidden platform infrastructure, never a tenant
 * integration (backend API contract §2).
 */
export const PROVIDER_CATALOG: ProviderMeta[] = [
  {
    provider: "SHOPIFY",
    name: "Shopify",
    description: "Pulls new orders in and triggers the automation pipeline.",
    authMethod: "oauth",
    workflows: ["order-validation", "cart-reminder"],
    connectGuide: [
      {
        title: "Enable the required API scopes first",
        detail: (
          <>
            In{" "}
            <a
              href="https://dev.shopify.com/dashboard"
              target="_blank"
              rel="noreferrer"
            >
              dev.shopify.com/dashboard
            </a>
            : <strong>Apps → this app → Versions → Create version</strong>, then enable exactly{" "}
            <code>read_orders</code>, <code>read_fulfillments</code>, <code>write_fulfillments</code>,{" "}
            <code>read_locations</code>, <code>read_merchant_managed_fulfillment_orders</code>, and{" "}
            <code>write_merchant_managed_fulfillment_orders</code>. Release the version — a scope isn't active
            until the version is released.
          </>
        ),
      },
      {
        title: "Find your store's admin domain",
        detail: 'Log in to Shopify admin — the URL is your shop domain, e.g. "yourstore.myshopify.com".',
      },
      {
        title: "Enter it and click Connect",
        detail: "You'll be redirected to Shopify to review and approve access.",
      },
      {
        title: "Approve the requested permissions",
        detail: "Orders and inventory access — you'll land back here automatically once approved.",
      },
      {
        title: "If the badge reads \"Needs attention\" afterward",
        detail: 'That means Protected Customer Data access is still needed — the "How to fix" link next to the error explains the extra step.',
      },
      {
        title: "Already connected and just added a scope?",
        detail: "OAuth grants aren't retroactive — an existing connection keeps whatever scopes it was approved with. Disconnect and reconnect here to pick up a newly released scope.",
      },
    ],
  },
  {
    // Mailer is a FE-only grouping — the backend still treats Resend,
    // SendGrid, and Mailgun as individual providers (IntegrationProvider
    // enum). The FE groups them into one card that opens a sub-page with a
    // radio-button picker. At most one mailer can be active at a time
    // (backend Constraint §2).
    provider: "MAILER",
    name: "Mailer",
    description: "Sends customer order and shipment notification emails.",
    authMethod: "apiKey",
    workflows: ["order-validation"],
    connectGuide: [],
  },
  {
    provider: "INVENTORY",
    name: "Inventory",
    description: "Checks stock levels before an order is fulfilled.",
    authMethod: "oauth",
    workflows: ["order-validation"],
    connectGuide: [],
  },
  {
    provider: "SHIPPING",
    name: "Shipping",
    description: "Creates shipments and returns tracking numbers.",
    authMethod: "apiKey",
    workflows: ["order-validation"],
    connectGuide: [],
  },
  {
    provider: "ALERTS",
    name: "Alerts",
    description: "Posts a notification to your team when a run needs attention.",
    authMethod: "apiKey",
    workflows: ["order-validation", "cart-reminder"],
    connectGuide: [],
  },
];

/** `provider` is the URL path segment (lowercase, e.g. "zoho_inventory") — normalize before matching against the catalog's uppercase `Provider` values. */
export function getProviderMeta(provider: string): ProviderMeta | undefined {
  const upper = provider.toUpperCase();
  return PROVIDER_CATALOG.find((entry) => entry.provider === upper);
}
