import type { ApiFetch } from "@/hooks/use-api-client";

import { apiKeyConnectResponseSchema, integrationsResponseSchema, oauthConnectResponseSchema } from "./schemas";
import type { ApiKeyConnectRequest, EasyPostConnectRequest, Provider, ShopifyConnectRequest } from "./types";

export async function listIntegrations(api: ApiFetch) {
  const data = await api<unknown>("/integrations");
  return integrationsResponseSchema.parse(data);
}

export async function connectShopify(api: ApiFetch, body: ShopifyConnectRequest) {
  const data = await api<unknown>("/integrations/SHOPIFY/connect", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return oauthConnectResponseSchema.parse(data);
}

export async function connectZoho(api: ApiFetch) {
  const data = await api<unknown>("/integrations/ZOHO_INVENTORY/connect", { method: "POST" });
  return oauthConnectResponseSchema.parse(data);
}

/** Covers every flat apiKey-auth provider (Resend, Slack) — identical request/response shape, only the field names in `body` differ per provider. EasyPost is the exception — see connectEasyPost. */
export async function connectApiKeyProvider(api: ApiFetch, provider: Provider, body: ApiKeyConnectRequest) {
  const data = await api<unknown>(`/integrations/${provider}/connect`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return apiKeyConnectResponseSchema.parse(data);
}

/** Same response shape as connectApiKeyProvider, but the request body isn't flat — EasyPost requires a nested fromAddress (backend API contract §2). */
export async function connectEasyPost(api: ApiFetch, body: EasyPostConnectRequest) {
  const data = await api<unknown>("/integrations/EASYPOST/connect", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return apiKeyConnectResponseSchema.parse(data);
}

export function testIntegration(api: ApiFetch, provider: Provider) {
  return api<undefined>(`/integrations/${provider}/test`, { method: "POST" });
}

export function disconnectIntegration(api: ApiFetch, provider: Provider) {
  return api<undefined>(`/integrations/${provider}`, { method: "DELETE" });
}
