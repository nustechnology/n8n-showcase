"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@clerk/nextjs";

import { useApiClient } from "@/hooks/use-api-client";

import * as api from "./api";
import type { OrderStatus } from "./types";

export const ORDERS_PAGE_SIZE = 10;

export function useWorkspaceOrdersKey() {
  const { organization } = useOrganization();
  return ["orders", organization?.id] as const;
}

export interface UseOrdersParams {
  page: number;
  // Overridable for callers that need a wider window than one page — e.g.
  // the dashboard's stat tiles, which aggregate over the recent set rather
  // than paginating (mirrors the backend's old MAX_ORDERS_RETURNED cap).
  take?: number;
  status?: OrderStatus;
  search?: string;
}

export function useOrders({ page, take = ORDERS_PAGE_SIZE, status, search }: UseOrdersParams) {
  const apiFetch = useApiClient();
  const key = useWorkspaceOrdersKey();
  return useQuery({
    queryKey: [...key, { page, take, status, search }],
    queryFn: () =>
      api.listOrders(apiFetch, {
        take,
        skip: (page - 1) * take,
        status,
        search: search || undefined,
      }),
    placeholderData: (previousData) => previousData,
  });
}

export function useOrder(id: string) {
  const apiFetch = useApiClient();
  const workspaceKey = useWorkspaceOrdersKey();
  return useQuery({
    queryKey: [...workspaceKey, id],
    queryFn: () => api.getOrder(apiFetch, id),
  });
}

export function useOrderTimeline(id: string) {
  const apiFetch = useApiClient();
  const workspaceKey = useWorkspaceOrdersKey();
  return useQuery({
    queryKey: [...workspaceKey, id, "timeline"],
    queryFn: () => api.getOrderTimeline(apiFetch, id),
  });
}

export function useUpdateOrderStatus(id: string) {
  const apiFetch = useApiClient();
  const queryClient = useQueryClient();
  const workspaceKey = useWorkspaceOrdersKey();
  const orderKey = [...workspaceKey, id];
  return useMutation({
    mutationFn: (body: { status: OrderStatus; reason?: string }) => api.updateOrderStatus(apiFetch, id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKey });
      queryClient.invalidateQueries({ queryKey: orderKey });
    },
  });
}

export function useBulkUpdateOrderStatus() {
  const apiFetch = useApiClient();
  const queryClient = useQueryClient();
  const workspaceKey = useWorkspaceOrdersKey();
  const BATCH_SIZE = 5;
  return useMutation({
    mutationFn: async (input: { ids: string[]; status: OrderStatus; reason?: string }) => {
      const results: PromiseSettledResult<unknown>[] = [];
      for (let i = 0; i < input.ids.length; i += BATCH_SIZE) {
        const batch = input.ids.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
          batch.map((id) => api.updateOrderStatus(apiFetch, id, { status: input.status, reason: input.reason }))
        );
        results.push(...batchResults);
      }
      return {
        succeeded: results.filter((r) => r.status === "fulfilled").length,
        failed: results.filter((r) => r.status === "rejected").length,
      };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: workspaceKey }),
  });
}
