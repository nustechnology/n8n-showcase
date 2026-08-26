import type { ApiFetch } from "@/hooks/use-api-client";

import type { RunStatus } from "@/lib/status";

import { workflowRunSchema, workflowRunsResponseSchema } from "./schemas";

export interface ListWorkflowRunsParams {
  take: number;
  skip: number;
  status?: RunStatus;
}

export async function listWorkflowRuns(api: ApiFetch, params: ListWorkflowRunsParams) {
  const query = new URLSearchParams({ take: String(params.take), skip: String(params.skip) });
  if (params.status) query.set("status", params.status);

  const data = await api<unknown>(`/workflow-runs?${query.toString()}`);
  return workflowRunsResponseSchema.parse(data);
}

export async function getWorkflowRun(api: ApiFetch, id: string) {
  const data = await api<unknown>(`/workflow-runs/${id}`);
  return workflowRunSchema.parse(data);
}

export function retryWorkflowRun(api: ApiFetch, id: string) {
  return api<undefined>(`/workflow-runs/${id}/retry`, { method: "POST" });
}
