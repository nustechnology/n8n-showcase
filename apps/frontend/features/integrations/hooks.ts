"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "@/hooks/use-api-client";

import * as api from "./api";
import type { ApiKeyConnectRequest, EasyPostConnectRequest, Provider, ShopifyConnectRequest } from "./types";

export const integrationsKey = ["integrations"] as const;

export function useIntegrations() {
  const apiFetch = useApiClient();
  return useQuery({
    queryKey: integrationsKey,
    queryFn: () => api.listIntegrations(apiFetch),
  });
}

/** Returns { authorizeUrl } — caller does `window.location.href = authorizeUrl`, a full-page redirect, not a client-side nav (backend API contract §2). */
export function useConnectShopify() {
  const apiFetch = useApiClient();
  return useMutation({
    mutationFn: (body: ShopifyConnectRequest) => api.connectShopify(apiFetch, body),
  });
}

/** Same redirect contract as Shopify — see useConnectShopify. */
export function useConnectZoho() {
  const apiFetch = useApiClient();
  return useMutation({
    mutationFn: () => api.connectZoho(apiFetch),
  });
}

/** Covers every flat apiKey-auth provider — see api.connectApiKeyProvider. */
export function useConnectApiKeyProvider(provider: Provider) {
  const apiFetch = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ApiKeyConnectRequest) => api.connectApiKeyProvider(apiFetch, provider, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: integrationsKey }),
  });
}

/** EasyPost's connect body is shaped differently (nested fromAddress) — see api.connectEasyPost. */
export function useConnectEasyPost() {
  const apiFetch = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: EasyPostConnectRequest) => api.connectEasyPost(apiFetch, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: integrationsKey }),
  });
}

export function useTestIntegration() {
  const apiFetch = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: Provider) => api.testIntegration(apiFetch, provider),
    // A failed test still flips the integration to DEGRADED server-side, so
    // refetch on both outcomes, not just success.
    onSettled: () => queryClient.invalidateQueries({ queryKey: integrationsKey }),
  });
}

export function useDisconnectIntegration() {
  const apiFetch = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: Provider) => api.disconnectIntegration(apiFetch, provider),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: integrationsKey }),
  });
}
