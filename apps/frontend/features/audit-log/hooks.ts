"use client";

import { useQuery } from "@tanstack/react-query";

import { useApiClient } from "@/hooks/use-api-client";

import * as api from "./api";

export const auditLogKey = ["audit-log"] as const;

export function useAuditLog() {
  const apiFetch = useApiClient();
  return useQuery({
    queryKey: auditLogKey,
    queryFn: () => api.listAuditLog(apiFetch),
  });
}
