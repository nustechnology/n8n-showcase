import { z } from "zod";

import { runStatusSchema, workflowStepStatusSchema } from "@/lib/status";

export const workflowRunStepSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: workflowStepStatusSchema,
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  error: z.record(z.string(), z.unknown()).nullable(),
});

// Verbatim GET /workflow-runs entry shape (backend API contract §4). Also
// used for the single-run GET /workflow-runs/:id response. `steps` is empty
// for runs created before backend Phase 3 shipped a real writer — the
// run-detail view falls back to a run-level-only view for those.
export const workflowRunSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  orderId: z.string().nullable(),
  n8nExecutionId: z.string().nullable(),
  workflowName: z.string(),
  status: runStatusSchema,
  error: z.record(z.string(), z.unknown()).nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  steps: z.array(workflowRunStepSchema),
});

export const workflowRunsResponseSchema = z.array(workflowRunSchema);
