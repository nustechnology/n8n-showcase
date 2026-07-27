import { z } from 'zod';

// Wire values ("completed"/"failed") match the workflow's "Close Workflow
// Run" node, not WorkflowRunStatus's own casing/naming (SUCCEEDED/FAILED).
export const UpdateWorkflowRunSchema = z.object({
  status: z.enum(['completed', 'failed']),
  errorMessage: z.string().min(1).optional(),
});

export type UpdateWorkflowRunInput = z.infer<typeof UpdateWorkflowRunSchema>;
