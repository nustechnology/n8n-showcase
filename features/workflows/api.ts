import type { ApiFetch } from "@/hooks/use-api-client";

import { workflowRunSchema, workflowRunsResponseSchema } from "./schemas";

export async function listWorkflowRuns(api: ApiFetch) {
  const data = await api<unknown>("/workflow-runs");
  return workflowRunsResponseSchema.parse(data);
}

export async function getWorkflowRun(api: ApiFetch, id: string) {
  const data = await api<unknown>(`/workflow-runs/${id}`);
  return workflowRunSchema.parse(data);
}

export function retryWorkflowRun(api: ApiFetch, id: string) {
  return api<undefined>(`/workflow-runs/${id}/retry`, { method: "POST" });
}
