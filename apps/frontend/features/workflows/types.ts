import type { z } from "zod";

import type { workflowRunSchema, workflowRunStepSchema } from "./schemas";

/** Validated at the API boundary — see api.ts. */
export type WorkflowRun = z.infer<typeof workflowRunSchema>;

export type WorkflowRunStep = z.infer<typeof workflowRunStepSchema>;
