import { z } from 'zod';

export const ListWorkflowRunsSchema = z.object({
  take: z.coerce.number().int().min(1).max(100).optional(),
  skip: z.coerce.number().int().min(0).optional(),
  status: z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED']).optional(),
});

export type ListWorkflowRunsInput = z.infer<typeof ListWorkflowRunsSchema>;
