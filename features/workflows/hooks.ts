"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "@/hooks/use-api-client";

import * as api from "./api";

export const workflowRunsKey = ["workflow-runs"] as const;

export function useWorkflowRuns() {
  const apiFetch = useApiClient();
  return useQuery({
    queryKey: workflowRunsKey,
    queryFn: () => api.listWorkflowRuns(apiFetch),
  });
}

export function useWorkflowRun(id: string) {
  const apiFetch = useApiClient();
  return useQuery({
    queryKey: ["workflow-runs", id],
    queryFn: () => api.getWorkflowRun(apiFetch, id),
  });
}

export function useRetryWorkflowRun(id: string) {
  const apiFetch = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.retryWorkflowRun(apiFetch, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowRunsKey });
      queryClient.invalidateQueries({ queryKey: ["workflow-runs", id] });
    },
  });
}

// Not a reuse of useRetryWorkflowRun(id) — that hook binds its id at
// hook-call time, which makes it impossible to invoke from an imperative
// click handler in a loop (hooks only run during render). This takes the
// id list at .mutate() time instead, firing the same underlying endpoint
// once per run via Promise.allSettled (no batch endpoint exists, and none
// is needed — each retry is already independently guarded server-side).
export function useBulkRetryWorkflowRuns() {
  const apiFetch = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map((id) => api.retryWorkflowRun(apiFetch, id)));
      return {
        succeeded: results.filter((r) => r.status === "fulfilled").length,
        failed: results.filter((r) => r.status === "rejected").length,
      };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: workflowRunsKey }),
  });
}
