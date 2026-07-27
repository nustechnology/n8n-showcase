"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "@/hooks/use-api-client";

import * as api from "./api";

export const notificationsKey = ["notifications"] as const;

export function useNotifications() {
  const apiFetch = useApiClient();
  return useQuery({
    queryKey: notificationsKey,
    queryFn: () => api.listNotifications(apiFetch),
  });
}

export function useMarkNotificationRead() {
  const apiFetch = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.markNotificationRead(apiFetch, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationsKey }),
  });
}
