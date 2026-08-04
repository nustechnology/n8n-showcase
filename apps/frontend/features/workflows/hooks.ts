"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@clerk/nextjs";

import { useApiClient } from "@/hooks/use-api-client";

import * as api from "./api";

function useWorkspaceWorkflowRunsKey() {
  const { organization } = useOrganization();
  return ["workflow-runs", organization?.id] as const;
}

export function useWorkflowRuns() {
  const apiFetch = useApiClient();
  const key = useWorkspaceWorkflowRunsKey();
  return useQuery({
    queryKey: key,
    queryFn: () => api.listWorkflowRuns(apiFetch),
  });
}

export function useWorkflowRun(id: string) {
  const apiFetch = useApiClient();
  const workspaceKey = useWorkspaceWorkflowRunsKey();
  return useQuery({
    queryKey: [...workspaceKey, id],
    queryFn: () => api.getWorkflowRun(apiFetch, id),
  });
}

export function useRetryWorkflowRun(id: string) {
  const apiFetch = useApiClient();
  const queryClient = useQueryClient();
  const workspaceKey = useWorkspaceWorkflowRunsKey();
  const runKey = [...workspaceKey, id];
  return useMutation({
    mutationFn: () => api.retryWorkflowRun(apiFetch, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKey });
      queryClient.invalidateQueries({ queryKey: runKey });
    },
  });
}

export function useBulkRetryWorkflowRuns() {
  const apiFetch = useApiClient();
  const queryClient = useQueryClient();
  const workspaceKey = useWorkspaceWorkflowRunsKey();
  const BATCH_SIZE = 5;
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const results: PromiseSettledResult<unknown>[] = [];
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
          batch.map((id) => api.retryWorkflowRun(apiFetch, id))
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
