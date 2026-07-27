"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "@/hooks/use-api-client";

import * as api from "./api";
import type { OrderStatus } from "./types";

export const ordersKey = ["orders"] as const;

export function useOrders() {
  const apiFetch = useApiClient();
  return useQuery({
    queryKey: ordersKey,
    queryFn: () => api.listOrders(apiFetch),
  });
}

export function useOrder(id: string) {
  const apiFetch = useApiClient();
  return useQuery({
    queryKey: ["orders", id],
    queryFn: () => api.getOrder(apiFetch, id),
  });
}

export function useOrderTimeline(id: string) {
  const apiFetch = useApiClient();
  return useQuery({
    queryKey: ["orders", id, "timeline"],
    queryFn: () => api.getOrderTimeline(apiFetch, id),
  });
}

export function useUpdateOrderStatus(id: string) {
  const apiFetch = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { status: OrderStatus; reason?: string }) => api.updateOrderStatus(apiFetch, id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersKey });
      queryClient.invalidateQueries({ queryKey: ["orders", id] });
    },
  });
}

// Not a reuse of useUpdateOrderStatus(id) — that hook binds its id at
// hook-call time, which makes it impossible to invoke from an imperative
// click handler in a loop (hooks only run during render). This takes the
// id list at .mutate() time instead, firing the same underlying endpoint
// once per order via Promise.allSettled (no batch endpoint exists, and
// none is needed — each call is already independently guarded server-side).
export function useBulkUpdateOrderStatus() {
  const apiFetch = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { ids: string[]; status: OrderStatus; reason?: string }) => {
      const results = await Promise.allSettled(
        input.ids.map((id) => api.updateOrderStatus(apiFetch, id, { status: input.status, reason: input.reason }))
      );
      return {
        succeeded: results.filter((r) => r.status === "fulfilled").length,
        failed: results.filter((r) => r.status === "rejected").length,
      };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ordersKey }),
  });
}
