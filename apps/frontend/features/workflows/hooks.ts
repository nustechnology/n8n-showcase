"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@clerk/nextjs";

import { useApiClient } from "@/hooks/use-api-client";

import type { RunStatus } from "@/lib/status";

import * as api from "./api";

export const WORKFLOW_RUNS_PAGE_SIZE = 10;

function useWorkspaceWorkflowRunsKey() {
  const { organization } = useOrganization();
  return ["workflow-runs", organization?.id] as const;
}

export interface UseWorkflowRunsParams {
  page: number;
  // Overridable for callers that need a wider window than one page — e.g.
  // the dashboard's stat tiles, which aggregate over the recent set rather
  // than paginating (mirrors the backend's old MAX_WORKFLOW_RUNS_RETURNED cap).
  take?: number;
  status?: RunStatus;
}

export function useWorkflowRuns({ page, take = WORKFLOW_RUNS_PAGE_SIZE, status }: UseWorkflowRunsParams) {
  const apiFetch = useApiClient();
  const key = useWorkspaceWorkflowRunsKey();
  return useQuery({
    queryKey: [...key, { page, take, status }],
    queryFn: () =>
      api.listWorkflowRuns(apiFetch, {
        take,
        skip: (page - 1) * take,
        status,
      }),
    placeholderData: (previousData) => previousData,
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
